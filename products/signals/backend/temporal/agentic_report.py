from dataclasses import dataclass

from django.db import transaction

import structlog
import temporalio
import posthoganalytics

from posthog.models.integration import Integration
from posthog.models.organization import OrganizationMembership
from posthog.models.team.team import Team
from posthog.sync import database_sync_to_async

from products.signals.backend.models import SignalReportArtefact
from products.signals.backend.report_generation.research import ReportResearchOutput, run_multi_turn_research
from products.signals.backend.temporal.actionability_judge import ActionabilityChoice, Priority
from products.signals.backend.temporal.types import SignalData
from products.tasks.backend.services.custom_prompt_runner import CustomPromptSandboxContext

logger = structlog.get_logger(__name__)

SIGNALS_AGENTIC_REPORT_GENERATION_FF = "signals-agentic-report-generation"
# TODO(signals): Signals reports do not yet carry repository context, but the sandbox task requires one.
# We hardcode posthog/posthog for this rollout because the current agentic report path is only meant to
# investigate the PostHog monorepo. Revisit once Signals reports can resolve a repository explicitly,
# likely from source metadata or a repo-selection layer shared with Tasks.
SIGNALS_AGENTIC_REPORT_REPOSITORY = "posthog/posthog"


@dataclass
class SignalsAgenticReportGateInput:
    team_id: int


@temporalio.activity.defn
async def signals_agentic_report_gate_activity(input: SignalsAgenticReportGateInput) -> bool:
    """Evaluate whether Signals should use the agentic report path for a team."""
    try:
        team = await Team.objects.only("id", "uuid", "organization_id").aget(id=input.team_id)
    except Team.DoesNotExist:
        logger.warning("signals agentic report gate: team does not exist", team_id=input.team_id)
        return False

    try:
        return posthoganalytics.feature_enabled(
            SIGNALS_AGENTIC_REPORT_GENERATION_FF,
            str(team.uuid),
            groups={
                "organization": str(team.organization_id),
                "project": str(team.id),
            },
            group_properties={
                "organization": {
                    "id": str(team.organization_id),
                },
                "project": {
                    "id": str(team.id),
                },
            },
            only_evaluate_locally=True,
            send_feature_flag_events=False,
        )
    except Exception:
        logger.exception(
            "signals agentic report gate: failed to evaluate feature flag",
            team_id=input.team_id,
            flag=SIGNALS_AGENTIC_REPORT_GENERATION_FF,
        )
        return False


@dataclass
class RunAgenticReportInput:
    team_id: int
    report_id: str
    signals: list[SignalData]


@dataclass
class RunAgenticReportOutput:
    title: str
    summary: str
    choice: ActionabilityChoice
    priority: Priority | None
    explanation: str
    already_addressed: bool


def _resolve_sandbox_context_for_report(team_id: int) -> CustomPromptSandboxContext:
    team = Team.objects.select_related("organization").get(id=team_id)
    membership = (
        OrganizationMembership.objects.select_related("user")
        .filter(organization=team.organization)
        .order_by("id")
        .first()
    )
    if not membership:
        raise RuntimeError(f"No users in organization '{team.organization.name}' (team {team.id})")
    github_integration = Integration.objects.filter(team=team, kind="github").first()
    if not github_integration:
        raise RuntimeError(
            f"No GitHub integration found for team {team.id}. "
            "Signals agentic report generation requires a connected GitHub integration."
        )
    # TODO: Pick the repo here, instead of hardcoding?
    return CustomPromptSandboxContext(
        team_id=team.id,
        user_id=membership.user_id,
        repository=SIGNALS_AGENTIC_REPORT_REPOSITORY,
    )


def _persist_agentic_report_artefacts(team_id: int, report_id: str, result: ReportResearchOutput) -> None:
    artefacts = [
        SignalReportArtefact(
            team_id=team_id,
            report_id=report_id,
            type=SignalReportArtefact.ArtefactType.SIGNAL_FINDING,
            content=finding.model_dump_json(),
        )
        for finding in result.findings
    ]
    artefacts.append(
        SignalReportArtefact(
            team_id=team_id,
            report_id=report_id,
            type=SignalReportArtefact.ArtefactType.ACTIONABILITY_JUDGMENT,
            content=result.actionability.model_dump_json(),
        )
    )
    if result.priority:
        artefacts.append(
            SignalReportArtefact(
                team_id=team_id,
                report_id=report_id,
                type=SignalReportArtefact.ArtefactType.PRIORITY_JUDGMENT,
                content=result.priority.model_dump_json(),
            )
        )
    with transaction.atomic():
        SignalReportArtefact.objects.bulk_create(artefacts)


@temporalio.activity.defn
async def run_agentic_report_activity(input: RunAgenticReportInput) -> RunAgenticReportOutput:
    """Run the sandbox-backed report research and persist its artefacts after full success."""
    try:
        # 1. Get context for the sandbox
        context = await database_sync_to_async(_resolve_sandbox_context_for_report, thread_sensitive=False)(
            input.team_id
        )
        # 2. Run the research
        result = await run_multi_turn_research(
            input.signals,
            context,
            branch="master",
        )
        # 3. Store the artefacts
        await database_sync_to_async(_persist_agentic_report_artefacts, thread_sensitive=False)(
            input.team_id,
            input.report_id,
            result,
        )
        logger.info(
            "signals agentic report completed",
            report_id=input.report_id,
            signal_count=len(input.signals),
            choice=result.actionability.actionability.value,
        )
        return RunAgenticReportOutput(
            title=result.title,
            summary=result.summary,
            choice=result.actionability.actionability,
            priority=result.priority.priority if result.priority else None,
            explanation=result.actionability.explanation,
            already_addressed=result.actionability.already_addressed,
        )
    except Exception as error:
        logger.exception(
            "signals agentic report failed",
            report_id=input.report_id,
            team_id=input.team_id,
            error=str(error),
        )
        raise
