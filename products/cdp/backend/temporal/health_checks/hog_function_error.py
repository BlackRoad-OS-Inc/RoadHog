from posthog.dags.common.owners import JobOwners
from posthog.models.health_issue import HealthIssue
from posthog.models.hog_functions.hog_function import HogFunction
from posthog.temporal.health_checks.detectors import CLICKHOUSE_BATCH_EXECUTION_POLICY
from posthog.temporal.health_checks.framework import HealthCheck
from posthog.temporal.health_checks.models import HealthCheckResult
from posthog.temporal.health_checks.query import execute_clickhouse_health_team_query

HOG_FUNCTION_ERROR_LOOKBACK_DAYS = 3
HOG_FUNCTION_MIN_ERRORS = 5

HOG_FUNCTION_ERROR_SQL = """
SELECT team_id, log_source_id, count() AS error_count
FROM log_entries
WHERE team_id IN %(team_ids)s
  AND log_source = 'hog_function'
  AND level = 'ERROR'
  AND timestamp >= now() - INTERVAL %(lookback_days)s DAY
GROUP BY team_id, log_source_id
HAVING error_count >= %(min_errors)s
"""


class HogFunctionErrorCheck(HealthCheck):
    name = "hog_function_error"
    kind = "hog_function_error"
    owner = JobOwners.TEAM_DATA_STACK
    policy = CLICKHOUSE_BATCH_EXECUTION_POLICY

    def detect(self, team_ids: list[int]) -> dict[int, list[HealthCheckResult]]:
        rows = execute_clickhouse_health_team_query(
            HOG_FUNCTION_ERROR_SQL,
            team_ids=team_ids,
            lookback_days=HOG_FUNCTION_ERROR_LOOKBACK_DAYS,
            params={"min_errors": HOG_FUNCTION_MIN_ERRORS},
        )

        if not rows:
            return {}

        source_ids = {str(row[1]) for row in rows}

        functions_by_id = {
            str(fn["id"]): fn for fn in HogFunction.objects.filter(id__in=source_ids).values("id", "name", "type")
        }

        issues: dict[int, list[HealthCheckResult]] = {}
        for team_id, log_source_id, error_count in rows:
            source_id = str(log_source_id)
            fn_info = functions_by_id.get(source_id)
            name = fn_info["name"] if fn_info else f"Unknown function ({source_id})"
            fn_type = fn_info["type"] if fn_info else "unknown"

            issues.setdefault(team_id, []).append(
                HealthCheckResult(
                    severity=HealthIssue.Severity.WARNING,
                    payload={
                        "pipeline_type": "hog_function",
                        "pipeline_id": source_id,
                        "pipeline_name": name,
                        "hog_function_type": fn_type,
                        "error_count": error_count,
                    },
                    hash_keys=["pipeline_type", "pipeline_id"],
                )
            )

        return issues
