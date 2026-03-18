from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html

from posthog.models.hog_flow.hog_flow import HogFlow

from products.workflows.backend.models.hog_flow_schedule import HogFlowSchedule
from products.workflows.backend.models.hog_flow_scheduled_run import HogFlowScheduledRun


class HogFlowScheduledRunInline(admin.TabularInline):
    model = HogFlowScheduledRun
    fk_name = "schedule"
    extra = 0
    readonly_fields = ("id", "scheduled_at", "status", "batch_job", "started_at", "completed_at", "failure_reason")
    fields = ("scheduled_at", "status", "batch_job", "started_at", "completed_at", "failure_reason")
    ordering = ("scheduled_at",)
    max_num = 20
    show_change_link = True


class HogFlowScheduleAdmin(admin.ModelAdmin):
    list_display = ("id", "hog_flow_link", "rrule", "status", "starts_at", "timezone", "created_at")
    list_filter = (
        ("status", admin.ChoicesFieldListFilter),
        ("created_at", admin.DateFieldListFilter),
    )
    list_select_related = ("hog_flow", "team")
    search_fields = ("hog_flow__name", "team__name", "rrule")
    ordering = ("-created_at",)
    readonly_fields = ("id", "team", "hog_flow", "created_at", "updated_at")
    fields = ("id", "team", "hog_flow", "rrule", "starts_at", "timezone", "status", "created_at", "updated_at")
    inlines = [HogFlowScheduledRunInline]

    @admin.display(description="HogFlow")
    def hog_flow_link(self, schedule: HogFlowSchedule):
        return format_html(
            '<a href="{}">{}</a>',
            reverse("admin:posthog_hogflow_change", args=[schedule.hog_flow.pk]),
            schedule.hog_flow.name,
        )


class HogFlowScheduledRunAdmin(admin.ModelAdmin):
    list_display = ("id", "schedule_link", "scheduled_at", "status", "started_at", "completed_at")
    list_filter = (
        ("status", admin.ChoicesFieldListFilter),
        ("scheduled_at", admin.DateFieldListFilter),
    )
    list_select_related = ("schedule", "schedule__hog_flow", "team")
    search_fields = ("schedule__hog_flow__name", "team__name")
    ordering = ("-scheduled_at",)
    readonly_fields = ("id", "team", "schedule", "batch_job", "created_at", "updated_at")
    fields = (
        "id",
        "team",
        "schedule",
        "scheduled_at",
        "status",
        "batch_job",
        "started_at",
        "completed_at",
        "failure_reason",
        "created_at",
        "updated_at",
    )

    @admin.display(description="Schedule")
    def schedule_link(self, run: HogFlowScheduledRun):
        return format_html(
            '<a href="{}">{}</a>',
            reverse("admin:workflows_hogflowschedule_change", args=[run.schedule.pk]),
            str(run.schedule),
        )


class HogFlowScheduleInline(admin.TabularInline):
    model = HogFlowSchedule
    extra = 0
    readonly_fields = ("id", "rrule", "starts_at", "timezone", "status", "created_at")
    fields = ("rrule", "starts_at", "timezone", "status", "created_at")
    show_change_link = True


class HogFlowAdmin(admin.ModelAdmin):
    inlines = [HogFlowScheduleInline]
    list_display = ("id", "name", "status", "version", "team_link", "created_at")
    list_filter = (
        ("status", admin.ChoicesFieldListFilter),
        ("updated_at", admin.DateFieldListFilter),
    )
    list_select_related = ("team",)
    search_fields = ("name", "team__name", "team__organization__name")
    ordering = ("-created_at",)
    readonly_fields = (
        "id",
        "version",
        "team",
        "team_link",
        "created_by",
        "created_at",
        "updated_at",
        "trigger",
        "trigger_masking",
        "conversion",
        "edges",
        "actions",
        "variables",
        "billable_action_types",
    )
    fields = (
        "name",
        "description",
        "status",
        "exit_condition",
        "abort_action",
        "version",
        "team_link",
        "created_by",
        "created_at",
        "updated_at",
        "trigger",
        "trigger_masking",
        "conversion",
        "edges",
        "actions",
        "variables",
        "billable_action_types",
    )

    @admin.display(description="Team")
    def team_link(self, hog_flow: HogFlow):
        return format_html(
            '<a href="{}">{}</a>',
            reverse("admin:posthog_team_change", args=[hog_flow.team.pk]),
            hog_flow.team.name,
        )
