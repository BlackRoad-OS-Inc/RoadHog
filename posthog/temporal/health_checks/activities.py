import math
import hashlib
import dataclasses
from datetime import timedelta
from itertools import batched

from django.db import close_old_connections
from django.db.models import Exists, OuterRef
from django.utils import timezone

import structlog
import temporalio.activity

from posthog.clickhouse.client.execute import KillSwitchLevel, get_kill_switch_level
from posthog.clickhouse.query_tagging import Feature, tag_queries
from posthog.dags.common.health.observability import push_health_check_metrics
from posthog.models.health_check_team_status import HealthCheckTeamStatus
from posthog.models.organization import OrganizationMembership
from posthog.models.team import Team
from posthog.sync import database_sync_to_async
from posthog.temporal.health_checks.models import BatchResult, HealthCheckWorkflowInputs
from posthog.temporal.health_checks.processing import _process_batch_detection
from posthog.temporal.health_checks.registry import ensure_registry_loaded, get_detect_fn, get_product

logger = structlog.get_logger(__name__)


def _team_rollout_rank(team_id: int) -> int:
    digest = hashlib.sha256(str(team_id).encode()).digest()
    return int.from_bytes(digest[:8], byteorder="big")


def _filter_team_ids_for_rollout(team_ids: list[int], rollout_percentage: float) -> list[int]:
    if rollout_percentage <= 0 or rollout_percentage > 1:
        raise ValueError(f"rollout_percentage must be in (0, 1], got {rollout_percentage}")
    if not team_ids:
        return []
    if rollout_percentage >= 1.0:
        return team_ids

    target_count = max(1, math.ceil(len(team_ids) * rollout_percentage))
    ranked_team_ids = sorted(team_ids, key=lambda team_id: (_team_rollout_rank(team_id), team_id))
    return ranked_team_ids[:target_count]


@dataclasses.dataclass
class TeamBatchResult:
    batches: list[list[int]]
    teams_skipped_as_fresh: int = 0


@database_sync_to_async
def _get_team_id_batches_sync(inputs: HealthCheckWorkflowInputs) -> dict:
    # Temporal activities run in a thread pool where DB connections can go stale
    # between executions. close_old_connections() ensures we get a fresh connection.
    close_old_connections()

    kill_switch_level = get_kill_switch_level()
    if kill_switch_level != KillSwitchLevel.OFF:
        logger.info(
            "skipping health check due to clickhouse kill switch",
            kind=inputs.kind,
            kill_switch_level=kill_switch_level.value,
        )
        return dataclasses.asdict(TeamBatchResult(batches=[]))

    use_freshness = inputs.stale_after_hours is not None and inputs.stale_after_hours > 0
    freshness_cutoff = timezone.now() - timedelta(hours=inputs.stale_after_hours) if use_freshness else None

    teams_skipped_as_fresh = 0

    if inputs.team_ids:
        team_ids = inputs.team_ids
        logger.info("processing configured teams", count=len(team_ids))

        if freshness_cutoff is not None:
            fresh_team_ids = set(
                HealthCheckTeamStatus.objects.filter(
                    team_id__in=team_ids,
                    kind=inputs.kind,
                    last_checked_at__gte=freshness_cutoff,
                ).values_list("team_id", flat=True)
            )
            teams_skipped_as_fresh = len(fresh_team_ids)
            team_ids = [tid for tid in team_ids if tid not in fresh_team_ids]
    else:
        qs = Team.objects.exclude(id=0)
        cutoff = None
        if inputs.active_since_days is not None and inputs.active_since_days > 0:
            cutoff = timezone.now() - timedelta(days=inputs.active_since_days)
            qs = qs.filter(
                Exists(
                    OrganizationMembership.objects.filter(
                        organization_id=OuterRef("organization_id"),
                        user__last_login__gte=cutoff,
                    )
                )
            )

        count_before_freshness = qs.count() if use_freshness else 0

        if freshness_cutoff is not None:
            qs = qs.exclude(
                Exists(
                    HealthCheckTeamStatus.objects.filter(
                        team_id=OuterRef("id"),
                        kind=inputs.kind,
                        last_checked_at__gte=freshness_cutoff,
                    )
                )
            )

        team_ids = list(qs.values_list("id", flat=True))
        teams_skipped_as_fresh = max(0, count_before_freshness - len(team_ids))

        logger.info(
            "team query complete",
            count=len(team_ids),
            active_since_days=inputs.active_since_days,
            cutoff=cutoff.isoformat() if cutoff else None,
        )

    if inputs.rollout_percentage < 1.0:
        team_ids = _filter_team_ids_for_rollout(team_ids, inputs.rollout_percentage)
        logger.info("after rollout filtering", rollout_pct=inputs.rollout_percentage, count=len(team_ids))

    batches = [list(b) for b in batched(team_ids, inputs.batch_size)]

    logger.info(
        "created team batches",
        batch_count=len(batches),
        batch_size=inputs.batch_size,
        teams_skipped_as_fresh=teams_skipped_as_fresh,
    )
    result = TeamBatchResult(batches=batches, teams_skipped_as_fresh=teams_skipped_as_fresh)
    return dataclasses.asdict(result)


@temporalio.activity.defn
async def get_team_id_batches(inputs: HealthCheckWorkflowInputs) -> dict:
    return await _get_team_id_batches_sync(inputs)


@database_sync_to_async
def _run_health_check_batch_sync(
    team_ids: list[int],
    kind: str,
    dry_run: bool,
) -> dict:
    # See comment in _get_team_id_batches_sync for why this is needed.
    close_old_connections()

    ensure_registry_loaded()
    tag_queries(
        product=get_product(kind),
        feature=Feature.HEALTH_CHECK,
        name=kind,
    )
    detect_fn = get_detect_fn(kind)

    result = _process_batch_detection(team_ids, kind, detect_fn, dry_run=dry_run)
    return dataclasses.asdict(result)


@temporalio.activity.defn
async def run_health_check_batch(
    team_ids: list[int],
    kind: str,
    dry_run: bool,
) -> dict:
    return await _run_health_check_batch_sync(team_ids, kind, dry_run)


@temporalio.activity.defn
async def push_health_check_metrics_activity(
    kind: str,
    totals_dict: dict,
    success: bool,
    teams_skipped_as_fresh: int = 0,
) -> None:
    totals = BatchResult(**totals_dict)
    push_health_check_metrics(kind, totals, success=success, teams_skipped_as_fresh=teams_skipped_as_fresh)
