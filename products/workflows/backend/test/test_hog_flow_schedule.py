from datetime import UTC, datetime

from posthog.test.base import APIBaseTest
from unittest import TestCase

import pytz
from parameterized import parameterized
from rest_framework import status

from products.workflows.backend.models.hog_flow_schedule import HogFlowSchedule
from products.workflows.backend.models.hog_flow_schedule.rrule_utils import compute_next_occurrences, validate_rrule
from products.workflows.backend.models.hog_flow_scheduled_run import HogFlowScheduledRun


def _batch_trigger(schedule=None):
    config = {
        "type": "batch",
        "filters": {"properties": [{"key": "$browser", "type": "person", "value": ["Chrome"], "operator": "exact"}]},
    }
    if schedule:
        config["schedule"] = schedule
    return config


def _make_workflow_payload(trigger_config, workflow_status="draft"):
    return {
        "name": "Test Batch Workflow",
        "status": workflow_status,
        "actions": [
            {
                "id": "trigger_node",
                "name": "trigger",
                "type": "trigger",
                "config": trigger_config,
            }
        ],
    }


class TestRRuleUtils(TestCase):
    @parameterized.expand(
        [
            ("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",),
            ("FREQ=DAILY;COUNT=1",),
            ("FREQ=MONTHLY;BYMONTHDAY=15",),
            ("FREQ=MONTHLY;BYMONTHDAY=-1",),
            ("FREQ=YEARLY;INTERVAL=2",),
        ]
    )
    def test_validate_rrule_accepts_valid_strings(self, rrule_str):
        validate_rrule(rrule_str)

    @parameterized.expand(
        [
            ("NOT_A_RRULE",),
            ("FREQ=INVALID",),
            ("",),
        ]
    )
    def test_validate_rrule_rejects_invalid_strings(self, rrule_str):
        with self.assertRaises(Exception):
            validate_rrule(rrule_str)

    def test_compute_next_occurrences_weekly(self):
        starts_at = datetime(2026, 3, 16, 12, 0, 0, tzinfo=UTC)  # Monday
        occurrences = compute_next_occurrences(
            "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO", starts_at, timezone_str="UTC", after=starts_at, count=3
        )
        assert len(occurrences) == 3
        assert occurrences[0].weekday() == 0  # Monday

    def test_compute_next_occurrences_daily_count_1(self):
        starts_at = datetime(2026, 3, 16, 12, 0, 0, tzinfo=UTC)
        after = datetime(2026, 3, 16, 11, 0, 0, tzinfo=UTC)
        occurrences = compute_next_occurrences("FREQ=DAILY;COUNT=1", starts_at, after=after, count=5)
        assert len(occurrences) == 1

    def test_compute_next_occurrences_monthly_last_day(self):
        starts_at = datetime(2026, 3, 1, 12, 0, 0, tzinfo=UTC)
        occurrences = compute_next_occurrences("FREQ=MONTHLY;BYMONTHDAY=-1", starts_at, after=starts_at, count=4)
        assert len(occurrences) == 4
        # Last days: Mar 31, Apr 30, May 31, Jun 30
        assert occurrences[0].day == 31
        assert occurrences[1].day == 30
        assert occurrences[2].day == 31
        assert occurrences[3].day == 30

    def test_compute_next_occurrences_with_until(self):
        starts_at = datetime(2026, 3, 1, 12, 0, 0, tzinfo=UTC)
        occurrences = compute_next_occurrences(
            "FREQ=WEEKLY;UNTIL=20260401T000000Z", starts_at, after=starts_at, count=10
        )
        for occ in occurrences:
            assert occ.replace(tzinfo=None) <= datetime(2026, 4, 1, 0, 0, 0)

    def test_compute_next_occurrences_exhausted_rrule_returns_empty(self):
        starts_at = datetime(2026, 3, 16, 12, 0, 0, tzinfo=UTC)
        after = datetime(2026, 3, 17, 12, 0, 0, tzinfo=UTC)
        occurrences = compute_next_occurrences("FREQ=DAILY;COUNT=1", starts_at, after=after, count=5)
        assert len(occurrences) == 0

    def test_compute_next_occurrences_timezone_aware_dst(self):
        """9 AM Europe/Prague should stay at 9 AM local across DST (March 29, 2026)."""
        prague = pytz.timezone("Europe/Prague")
        # March 16 is CET (UTC+1), April 6 is CEST (UTC+2)
        starts_at = prague.localize(datetime(2026, 3, 16, 9, 0, 0))

        occurrences = compute_next_occurrences(
            "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
            starts_at,
            timezone_str="Europe/Prague",
            after=starts_at,
            count=4,
        )
        assert len(occurrences) == 4

        # Before DST (CET): 9 AM Prague = 8 AM UTC
        assert occurrences[0].astimezone(prague).hour == 9
        assert occurrences[0].utcoffset().total_seconds() == 3600  # UTC+1
        assert occurrences[0].astimezone(pytz.utc).hour == 8

        # After DST (CEST): 9 AM Prague = 7 AM UTC
        assert occurrences[2].astimezone(prague).hour == 9
        assert occurrences[2].utcoffset().total_seconds() == 7200  # UTC+2
        assert occurrences[2].astimezone(pytz.utc).hour == 7

    def test_compute_next_occurrences_returns_utc(self):
        """All returned occurrences should be in UTC regardless of input timezone."""
        starts_at = datetime(2026, 3, 16, 9, 0, 0, tzinfo=UTC)
        occurrences = compute_next_occurrences(
            "FREQ=DAILY;INTERVAL=1", starts_at, timezone_str="US/Eastern", after=starts_at, count=3
        )
        for occ in occurrences:
            assert occ.tzinfo is not None
            assert occ.utcoffset().total_seconds() == 0  # UTC


class TestHogFlowScheduleAPI(APIBaseTest):
    def _create_batch_workflow(self, schedule=None, workflow_status="active"):
        payload = _make_workflow_payload(
            _batch_trigger(schedule=schedule),
            workflow_status=workflow_status,
        )
        response = self.client.post(f"/api/projects/{self.team.id}/hog_flows/", payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.json()
        return response.json()

    def test_saving_workflow_with_schedule_creates_hogflow_schedule(self):
        schedule = {
            "rrule": "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "Europe/Prague",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        schedules = HogFlowSchedule.objects.filter(hog_flow_id=workflow["id"])
        assert schedules.count() == 1
        sched = schedules.first()
        assert sched.rrule == "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO"
        assert sched.timezone == "Europe/Prague"
        assert sched.status == HogFlowSchedule.Status.ACTIVE

    def test_saving_workflow_with_schedule_generates_pending_runs(self):
        schedule = {
            "rrule": "FREQ=DAILY;INTERVAL=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        sched = HogFlowSchedule.objects.get(hog_flow_id=workflow["id"])
        runs = HogFlowScheduledRun.objects.filter(schedule=sched, status=HogFlowScheduledRun.Status.PENDING)
        assert runs.count() == 10  # Window size

    def test_saving_workflow_with_count_1_schedule_creates_one_run(self):
        schedule = {
            "rrule": "FREQ=DAILY;COUNT=1",
            "starts_at": "2026-03-20T12:00:00.000Z",
            "timezone": "UTC",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        sched = HogFlowSchedule.objects.get(hog_flow_id=workflow["id"])
        assert sched.rrule == "FREQ=DAILY;COUNT=1"
        assert sched.status == HogFlowSchedule.Status.ACTIVE

        runs = HogFlowScheduledRun.objects.filter(schedule=sched, status=HogFlowScheduledRun.Status.PENDING)
        assert runs.count() == 1

    def test_removing_schedule_deletes_pending_runs(self):
        schedule = {
            "rrule": "FREQ=DAILY;INTERVAL=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        # Remove the schedule
        trigger_config = _batch_trigger()
        response = self.client.patch(
            f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/",
            _make_workflow_payload(trigger_config, workflow_status="active"),
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        sched = HogFlowSchedule.objects.get(hog_flow_id=workflow["id"])
        assert sched.status == HogFlowSchedule.Status.COMPLETED

        pending = HogFlowScheduledRun.objects.filter(schedule=sched, status=HogFlowScheduledRun.Status.PENDING)
        assert pending.count() == 0

    def test_deactivating_workflow_pauses_schedule(self):
        schedule = {
            "rrule": "FREQ=WEEKLY;INTERVAL=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        # Deactivate
        response = self.client.patch(
            f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/",
            {"status": "draft"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        sched = HogFlowSchedule.objects.get(hog_flow_id=workflow["id"])
        assert sched.status == HogFlowSchedule.Status.PAUSED

    def test_draft_workflow_creates_paused_schedule(self):
        schedule = {
            "rrule": "FREQ=DAILY;INTERVAL=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        payload = _make_workflow_payload(_batch_trigger(schedule=schedule), workflow_status="draft")
        response = self.client.post(f"/api/projects/{self.team.id}/hog_flows/", payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED

        sched = HogFlowSchedule.objects.get(hog_flow_id=response.json()["id"])
        assert sched.status == HogFlowSchedule.Status.PAUSED

        runs = HogFlowScheduledRun.objects.filter(schedule=sched)
        assert runs.count() == 0

    def test_rrule_validation_rejects_invalid_rrule(self):
        schedule = {
            "rrule": "NOT_VALID",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        payload = _make_workflow_payload(_batch_trigger(schedule=schedule), workflow_status="active")
        response = self.client.post(f"/api/projects/{self.team.id}/hog_flows/", payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rrule_validation_rejects_missing_starts_at(self):
        schedule = {
            "rrule": "FREQ=DAILY;INTERVAL=1",
            "timezone": "UTC",
        }
        payload = _make_workflow_payload(_batch_trigger(schedule=schedule), workflow_status="active")
        response = self.client.post(f"/api/projects/{self.team.id}/hog_flows/", payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_schedules_endpoint(self):
        schedule = {
            "rrule": "FREQ=WEEKLY;INTERVAL=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        response = self.client.get(f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/schedules/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()) == 1
        assert response.json()[0]["rrule"] == "FREQ=WEEKLY;INTERVAL=1"
        assert response.json()[0]["status"] == "active"

    def test_list_scheduled_runs_endpoint(self):
        schedule = {
            "rrule": "FREQ=DAILY;INTERVAL=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        response = self.client.get(f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/scheduled_runs/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()) == 10

    def test_cancel_pending_run(self):
        schedule = {
            "rrule": "FREQ=DAILY;INTERVAL=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        runs_response = self.client.get(f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/scheduled_runs/")
        run_id = runs_response.json()[0]["id"]

        response = self.client.delete(
            f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/scheduled_runs/{run_id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "cancelled"

    def test_cancel_non_pending_run_fails(self):
        schedule = {
            "rrule": "FREQ=DAILY;INTERVAL=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        run = HogFlowScheduledRun.objects.filter(
            schedule__hog_flow_id=workflow["id"], status=HogFlowScheduledRun.Status.PENDING
        ).first()
        run.status = HogFlowScheduledRun.Status.COMPLETED
        run.save()

        response = self.client.delete(
            f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/scheduled_runs/{run.id}/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_pause_and_resume_schedule(self):
        schedule = {
            "rrule": "FREQ=WEEKLY;INTERVAL=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        sched = HogFlowSchedule.objects.get(hog_flow_id=workflow["id"])

        # Pause
        response = self.client.patch(
            f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/schedules/{sched.id}/",
            {"status": "paused"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "paused"

        pending = HogFlowScheduledRun.objects.filter(schedule=sched, status=HogFlowScheduledRun.Status.PENDING)
        assert pending.count() == 0

        # Resume
        response = self.client.patch(
            f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/schedules/{sched.id}/",
            {"status": "active"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "active"

        pending = HogFlowScheduledRun.objects.filter(schedule=sched, status=HogFlowScheduledRun.Status.PENDING)
        assert pending.count() > 0

    def test_count_1_schedule_exhaustion(self):
        schedule = {
            "rrule": "FREQ=DAILY;COUNT=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        sched = HogFlowSchedule.objects.get(hog_flow_id=workflow["id"])
        assert sched.status == HogFlowSchedule.Status.ACTIVE

        # Simulate the single run being completed
        run = HogFlowScheduledRun.objects.get(schedule=sched, status=HogFlowScheduledRun.Status.PENDING)
        run.status = HogFlowScheduledRun.Status.COMPLETED
        run.save()

        # Replenish: should find no more occurrences and mark schedule as completed
        from posthog.api.hog_flow import _replenish_scheduled_runs

        _replenish_scheduled_runs(sched, self.team.id)

        sched.refresh_from_db()
        assert sched.status == HogFlowSchedule.Status.COMPLETED

        new_pending = HogFlowScheduledRun.objects.filter(schedule=sched, status=HogFlowScheduledRun.Status.PENDING)
        assert new_pending.count() == 0

    def test_updating_schedule_rrule_regenerates_runs(self):
        schedule = {
            "rrule": "FREQ=DAILY;INTERVAL=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        sched = HogFlowSchedule.objects.get(hog_flow_id=workflow["id"])
        old_run_ids = set(
            HogFlowScheduledRun.objects.filter(schedule=sched, status=HogFlowScheduledRun.Status.PENDING).values_list(
                "id", flat=True
            )
        )

        # Update to weekly
        new_schedule = {
            "rrule": "FREQ=WEEKLY;INTERVAL=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        response = self.client.patch(
            f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/",
            _make_workflow_payload(_batch_trigger(schedule=new_schedule), workflow_status="active"),
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        sched.refresh_from_db()
        assert sched.rrule == "FREQ=WEEKLY;INTERVAL=1"

        # Old runs should be deleted
        remaining = HogFlowScheduledRun.objects.filter(id__in=old_run_ids)
        assert remaining.count() == 0

        # New pending runs should exist
        new_pending = HogFlowScheduledRun.objects.filter(schedule=sched, status=HogFlowScheduledRun.Status.PENDING)
        assert new_pending.count() > 0

    def test_cannot_resume_schedule_on_inactive_workflow(self):
        schedule = {
            "rrule": "FREQ=WEEKLY;INTERVAL=1",
            "starts_at": "2026-03-16T12:00:00.000Z",
            "timezone": "UTC",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        sched = HogFlowSchedule.objects.get(hog_flow_id=workflow["id"])

        # Deactivate workflow
        self.client.patch(
            f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/",
            {"status": "draft"},
            format="json",
        )

        # Try to resume schedule on inactive workflow
        response = self.client.patch(
            f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/schedules/{sched.id}/",
            {"status": "active"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_schedule_id_returns_404(self):
        workflow = self._create_batch_workflow(
            schedule={"rrule": "FREQ=DAILY;INTERVAL=1", "starts_at": "2026-03-16T12:00:00.000Z", "timezone": "UTC"}
        )
        response = self.client.patch(
            f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/schedules/not-a-uuid/",
            {"status": "paused"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_invalid_run_id_returns_404(self):
        workflow = self._create_batch_workflow(
            schedule={"rrule": "FREQ=DAILY;INTERVAL=1", "starts_at": "2026-03-16T12:00:00.000Z", "timezone": "UTC"}
        )
        response = self.client.delete(
            f"/api/projects/{self.team.id}/hog_flows/{workflow['id']}/scheduled_runs/not-a-uuid/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_no_schedule_creates_nothing(self):
        workflow = self._create_batch_workflow()
        assert HogFlowSchedule.objects.filter(hog_flow_id=workflow["id"]).count() == 0
        assert HogFlowScheduledRun.objects.filter(schedule__hog_flow_id=workflow["id"]).count() == 0

    def test_schedule_with_timezone_stores_timezone(self):
        schedule = {
            "rrule": "FREQ=DAILY;INTERVAL=1",
            "starts_at": "2026-03-16T08:00:00.000Z",
            "timezone": "US/Eastern",
        }
        workflow = self._create_batch_workflow(schedule=schedule)

        sched = HogFlowSchedule.objects.get(hog_flow_id=workflow["id"])
        assert sched.timezone == "US/Eastern"
