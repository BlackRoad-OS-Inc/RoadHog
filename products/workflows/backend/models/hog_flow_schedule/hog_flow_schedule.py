from django.db import models

from posthog.models.utils import RootTeamMixin, UUIDTModel


class HogFlowSchedule(RootTeamMixin, UUIDTModel):
    """
    Stores a schedule definition for a HogFlow.
    Supports both recurring schedules and one-time runs (COUNT=1).
    """

    class Meta:
        indexes = [
            models.Index(fields=["team"]),
        ]

    class Status(models.TextChoices):
        ACTIVE = "active"
        PAUSED = "paused"
        COMPLETED = "completed"  # Schedule exhausted (COUNT/UNTIL reached)

    team = models.ForeignKey("posthog.Team", on_delete=models.DO_NOTHING)
    hog_flow = models.ForeignKey("posthog.HogFlow", on_delete=models.DO_NOTHING, related_name="schedules")
    rrule = models.TextField()  # RFC 5545 RRULE string
    starts_at = models.DateTimeField()  # Anchor datetime for the recurrence (stored UTC)
    timezone = models.CharField(max_length=64, default="UTC")  # Timezone for RRULE expansion (DST-aware)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"HogFlowSchedule {self.id} for HogFlow {self.hog_flow_id}"
