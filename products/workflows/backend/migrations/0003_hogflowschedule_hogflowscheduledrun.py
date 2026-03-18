import django.db.models.deletion
from django.db import migrations, models

import posthog.models.utils


class Migration(migrations.Migration):
    dependencies = [
        ("posthog", "0956_team_conversations_enabled_and_more"),
        ("workflows", "0002_hogflowbatchjob_scheduled_at"),
    ]

    operations = [
        migrations.CreateModel(
            name="HogFlowSchedule",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=posthog.models.utils.UUIDT, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("rrule", models.TextField()),
                ("starts_at", models.DateTimeField()),
                ("timezone", models.CharField(default="UTC", max_length=64)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("active", "Active"),
                            ("paused", "Paused"),
                            ("completed", "Completed"),
                        ],
                        default="active",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "team",
                    models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to="posthog.team"),
                ),
                (
                    "hog_flow",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        related_name="schedules",
                        to="posthog.hogflow",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["team"], name="workflows_h_team_id_sched_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="HogFlowScheduledRun",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=posthog.models.utils.UUIDT, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("scheduled_at", models.DateTimeField(db_index=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("queued", "Queued"),
                            ("completed", "Completed"),
                            ("failed", "Failed"),
                            ("skipped", "Skipped"),
                            ("cancelled", "Cancelled"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("failure_reason", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "team",
                    models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to="posthog.team"),
                ),
                (
                    "schedule",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="runs",
                        to="workflows.hogflowschedule",
                    ),
                ),
                (
                    "batch_job",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to="workflows.hogflowbatchjob",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["status", "scheduled_at"], name="workflows_h_status_sched_idx"),
                    models.Index(fields=["schedule", "-scheduled_at"], name="workflows_h_sched_at_desc_idx"),
                ],
            },
        ),
    ]
