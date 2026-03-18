import time

from django.utils import timezone

import structlog

from posthog.dags.common.health.db import _resolve_stale_issues, _upsert_issues
from posthog.models.health_check_team_status import HealthCheckTeamStatus
from posthog.temporal.health_checks.models import BatchDetectFn, BatchResult
from posthog.temporal.health_checks.validation import _validate_batch_output

logger = structlog.get_logger(__name__)


def _update_team_check_status(team_ids: list[int], kind: str) -> None:
    now = timezone.now()
    HealthCheckTeamStatus.objects.bulk_create(
        [HealthCheckTeamStatus(team_id=tid, kind=kind, last_checked_at=now) for tid in team_ids],
        update_conflicts=True,
        unique_fields=["team_id", "kind"],
        update_fields=["last_checked_at"],
    )


def _process_batch_detection(
    team_ids: list[int],
    kind: str,
    detect_fn: BatchDetectFn,
    *,
    dry_run: bool = False,
) -> BatchResult:
    result = BatchResult(batch_size=len(team_ids))

    start = time.monotonic()
    issues_by_team = detect_fn(team_ids)
    result.detect_duration = time.monotonic() - start

    issues_by_team, teams_dropped = _validate_batch_output(issues_by_team, set(team_ids), kind)

    result.teams_skipped = teams_dropped
    result.teams_with_issues = len(issues_by_team)
    result.teams_healthy = len(team_ids) - len(issues_by_team) - teams_dropped

    if dry_run:
        issue_count = sum(len(v) for v in issues_by_team.values())
        logger.info(
            "dry run complete, skipping DB writes",
            kind=kind,
            teams_with_issues=result.teams_with_issues,
            issue_count=issue_count,
            teams_healthy=result.teams_healthy,
        )
        return result

    start = time.monotonic()
    result.issues_upserted = _upsert_issues(kind, issues_by_team)
    result.db_write_duration = time.monotonic() - start

    healthy_team_ids = set(team_ids) - set(issues_by_team.keys())

    start = time.monotonic()
    result.issues_resolved = _resolve_stale_issues(kind, issues_by_team, healthy_team_ids)
    result.resolve_duration = time.monotonic() - start

    _update_team_check_status(team_ids, kind)

    return result
