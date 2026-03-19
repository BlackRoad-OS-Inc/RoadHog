from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("posthog", "1058_migrate_aggregation_to_condition_sets"),
    ]

    operations = [
        migrations.AddField(
            model_name="team",
            name="schema_validation_disabled",
            field=models.BooleanField(blank=True, default=False, null=True),
        ),
    ]
