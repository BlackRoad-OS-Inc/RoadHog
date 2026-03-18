from django.db import models


class HealthCheckTeamStatus(models.Model):
    team = models.ForeignKey("posthog.Team", on_delete=models.CASCADE)
    kind = models.CharField(max_length=100)
    last_checked_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["team_id", "kind"], name="unique_health_check_team_status"),
        ]
        indexes = [
            models.Index(fields=["kind", "last_checked_at"]),
        ]
