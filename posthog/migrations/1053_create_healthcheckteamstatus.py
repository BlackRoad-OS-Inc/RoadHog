import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("posthog", "1052_migrate_legacy_personal_api_key_scopes"),
    ]

    operations = [
        migrations.CreateModel(
            name="HealthCheckTeamStatus",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(max_length=100)),
                ("last_checked_at", models.DateTimeField()),
                (
                    "team",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="posthog.team",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["kind", "last_checked_at"], name="posthog_hea_kind_b3e1f0_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=("team_id", "kind"), name="unique_health_check_team_status"),
                ],
            },
        ),
    ]
