# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("signals", "0011_alter_signalreportartefact_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="signalreportartefact",
            name="type",
            field=models.CharField(
                choices=[
                    ("video_segment", "Video Segment"),
                    ("safety_judgment", "Safety Judgment"),
                    ("actionability_judgment", "Actionability Judgment"),
                    ("priority_judgment", "Priority Judgment"),
                    ("signal_finding", "Signal Finding"),
                    ("repo_selection", "Repo Selection"),
                ],
                max_length=100,
            ),
        ),
    ]
