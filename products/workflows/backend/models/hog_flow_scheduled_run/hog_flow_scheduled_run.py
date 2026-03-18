from django.db import models

from posthog.models.utils import RootTeamMixin, UUIDTModel


class HogFlowScheduledRun(RootTeamMixin, UUIDTModel):
    """
    Represents a single concrete occurrence of a recurring schedule.
    Each row is one scheduled execution that the poller will pick up when it becomes due.
    """

    class Meta:
        indexes = [
            models.Index(fields=["status", "scheduled_at"]),  # Poller query
            models.Index(fields=["schedule", "-scheduled_at"]),  # List runs for a schedule
        ]

    class Status(models.TextChoices):
        PENDING = "pending"  # Not yet due
        QUEUED = "queued"  # Picked up by poller, batch job being created
        COMPLETED = "completed"  # Successfully triggered
        FAILED = "failed"  # Failed to trigger
        SKIPPED = "skipped"  # Skipped (e.g., workflow deactivated)
        CANCELLED = "cancelled"  # Cancelled by user

    team = models.ForeignKey("posthog.Team", on_delete=models.DO_NOTHING)
    schedule = models.ForeignKey("workflows.HogFlowSchedule", on_delete=models.CASCADE, related_name="runs")
    scheduled_at = models.DateTimeField(db_index=True)  # When this run should execute
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    batch_job = models.ForeignKey("workflows.HogFlowBatchJob", null=True, blank=True, on_delete=models.SET_NULL)
    started_at = models.DateTimeField(null=True, blank=True)  # When execution started
    completed_at = models.DateTimeField(null=True, blank=True)  # When execution finished
    failure_reason = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"HogFlowScheduledRun {self.id} at {self.scheduled_at} ({self.status})"
