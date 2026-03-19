from datetime import UTC, datetime

from django.db import transaction
from django.db.models import QuerySet

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, viewsets
from rest_framework.exceptions import ValidationError

from posthog.api.routing import TeamAndOrgViewSetMixin
from posthog.api.shared import UserBasicSerializer
from posthog.models.activity_logging.activity_log import Detail, changes_between, log_activity
from posthog.models.signals import model_activity_signal, mutable_receiver
from posthog.models.team.team import Team
from posthog.permissions import PostHogFeatureFlagPermission

from products.logs.backend.models import LogsAlertConfiguration

ALLOWED_WINDOW_MINUTES = {1, 5, 10, 15, 30, 60}
MAX_ALERTS_PER_TEAM = 20


def _any_field_changed(instance: LogsAlertConfiguration, validated_data: dict, fields: set[str]) -> bool:
    return any(f in validated_data and validated_data[f] != getattr(instance, f) for f in fields)


class LogsAlertConfigurationSerializer(serializers.ModelSerializer):
    created_by = UserBasicSerializer(read_only=True)
    filters = serializers.JSONField(
        help_text="Filter criteria — subset of LogsViewerFilters. Must contain at least one of: "
        "severityLevels (list of severity strings), serviceNames (list of service name strings), "
        "or filterGroup (property filter group object)."
    )
    threshold_operator = serializers.ChoiceField(
        choices=LogsAlertConfiguration.ThresholdOperator.choices,
        default=LogsAlertConfiguration.ThresholdOperator.ABOVE,
        help_text="Whether the alert fires when the count is above or below the threshold.",
    )
    evaluation_periods = serializers.IntegerField(
        default=1,
        min_value=1,
        max_value=10,
        help_text="Total number of check periods in the sliding evaluation window for firing (M in N-of-M).",
    )
    datapoints_to_alarm = serializers.IntegerField(
        default=1,
        min_value=1,
        max_value=10,
        help_text="How many periods within the evaluation window must breach the threshold to fire (N in N-of-M).",
    )

    class Meta:
        model = LogsAlertConfiguration
        fields = [
            "id",
            "name",
            "enabled",
            "filters",
            "threshold_count",
            "threshold_operator",
            "window_minutes",
            "check_interval_minutes",
            "state",
            "evaluation_periods",
            "datapoints_to_alarm",
            "cooldown_minutes",
            "snooze_until",
            "next_check_at",
            "last_notified_at",
            "last_checked_at",
            "consecutive_failures",
            "created_at",
            "created_by",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "check_interval_minutes",
            "state",
            "next_check_at",
            "last_notified_at",
            "last_checked_at",
            "consecutive_failures",
            "created_at",
            "created_by",
            "updated_at",
        ]

    def validate(self, attrs: dict) -> dict:
        filters = attrs.get("filters", getattr(self.instance, "filters", None) or {})
        if not isinstance(filters, dict):
            raise ValidationError({"filters": "Must be a JSON object."})
        has_severity = bool(filters.get("severityLevels"))
        has_services = bool(filters.get("serviceNames"))
        has_filter_group = bool(filters.get("filterGroup"))
        if not (has_severity or has_services or has_filter_group):
            raise ValidationError(
                {"filters": "At least one filter is required (severityLevels, serviceNames, or filterGroup)."}
            )

        window = attrs.get("window_minutes", getattr(self.instance, "window_minutes", None))
        if window is not None and window not in ALLOWED_WINDOW_MINUTES:
            raise ValidationError({"window_minutes": f"Must be one of {sorted(ALLOWED_WINDOW_MINUTES)}."})

        evaluation_periods = attrs.get("evaluation_periods", getattr(self.instance, "evaluation_periods", 1))
        datapoints_to_alarm = attrs.get("datapoints_to_alarm", getattr(self.instance, "datapoints_to_alarm", 1))
        if datapoints_to_alarm > evaluation_periods:
            raise ValidationError(
                {
                    "datapoints_to_alarm": f"Cannot exceed evaluation_periods ({datapoints_to_alarm} > {evaluation_periods})."
                }
            )

        snooze_until = attrs.get("snooze_until")
        if snooze_until is not None and snooze_until <= datetime.now(UTC):
            raise ValidationError({"snooze_until": "Must be a future datetime."})

        return attrs

    def update(self, instance: LogsAlertConfiguration, validated_data: dict) -> LogsAlertConfiguration:
        if "snooze_until" in validated_data:
            snooze_value = validated_data.pop("snooze_until")
            if snooze_value is None:
                instance.state = LogsAlertConfiguration.State.NOT_FIRING
                instance.snooze_until = None
            else:
                instance.state = LogsAlertConfiguration.State.SNOOZED
                instance.snooze_until = snooze_value

        threshold_or_filter_fields = {
            "threshold_count",
            "threshold_operator",
            "filters",
            "datapoints_to_alarm",
            "evaluation_periods",
        }

        threshold_changed = _any_field_changed(instance, validated_data, threshold_or_filter_fields)
        window_changed = _any_field_changed(instance, validated_data, {"window_minutes"})

        if threshold_changed:
            instance.mark_for_recheck(reset_state=True)
        elif window_changed:
            instance.mark_for_recheck(reset_state=False)

        return super().update(instance, validated_data)

    def create(self, validated_data: dict) -> LogsAlertConfiguration:
        validated_data["team_id"] = self.context["team_id"]
        validated_data["created_by"] = self.context["request"].user

        with transaction.atomic():
            # select_for_update().count() doesn't acquire row locks because
            # Django optimises count() to SELECT COUNT(*). Locking the team
            # row instead serialises concurrent creates for this team.
            Team.objects.select_for_update().get(id=validated_data["team_id"])
            count = LogsAlertConfiguration.objects.filter(team_id=validated_data["team_id"]).count()
            if count >= MAX_ALERTS_PER_TEAM:
                raise ValidationError(f"Maximum number of alerts ({MAX_ALERTS_PER_TEAM}) reached for this team.")
            return super().create(validated_data)


@extend_schema(tags=["logs"])
class LogsAlertViewSet(TeamAndOrgViewSetMixin, viewsets.ModelViewSet):
    scope_object = "logs"
    queryset = LogsAlertConfiguration.objects.all().order_by("-created_at")
    serializer_class = LogsAlertConfigurationSerializer
    lookup_field = "id"
    posthog_feature_flag = "logs-alerting"
    permission_classes = [PostHogFeatureFlagPermission]

    def safely_get_queryset(self, queryset: QuerySet) -> QuerySet:
        return queryset.filter(team_id=self.team_id)


@mutable_receiver(model_activity_signal, sender=LogsAlertConfiguration)
def handle_logs_alert_activity(
    sender,
    scope,
    before_update,
    after_update,
    activity,
    user,
    was_impersonated=False,
    **kwargs,
):
    instance = after_update or before_update
    log_activity(
        organization_id=instance.team.organization_id,
        team_id=instance.team_id,
        user=user,
        was_impersonated=was_impersonated,
        item_id=instance.id,
        scope=scope,
        activity=activity,
        detail=Detail(
            changes=changes_between(scope, previous=before_update, current=after_update),
            name=instance.name,
        ),
    )
