"""
Business logic for ci_monitoring.

Validation, calculations, business rules, ORM queries.
Called by facade/api.py.
"""

from __future__ import annotations

import uuid
import datetime

from django.db.models import QuerySet
from django.utils import timezone

from .facade.enums import QuarantineState, TestExecutionStatus
from .models import CIRun, MainStreak, Quarantine, Repo, TestCase, TestExecution

# --- Repo ---


def create_repo(
    *,
    team_id: int,
    repo_external_id: int,
    repo_full_name: str,
    default_branch: str = "main",
) -> Repo:
    repo, _ = Repo.objects.update_or_create(
        team_id=team_id,
        repo_external_id=repo_external_id,
        defaults={
            "repo_full_name": repo_full_name,
            "default_branch": default_branch,
        },
    )
    return repo


def get_repo(*, repo_id: uuid.UUID, team_id: int) -> Repo:
    return Repo.objects.get(id=repo_id, team_id=team_id)


def list_repos(*, team_id: int) -> QuerySet[Repo]:
    return Repo.objects.filter(team_id=team_id).order_by("repo_full_name")


# --- CI Runs ---


def list_ci_runs(
    *,
    team_id: int,
    repo_id: uuid.UUID | None = None,
    branch: str | None = None,
    workflow_name: str | None = None,
    limit: int = 50,
) -> QuerySet[CIRun]:
    qs = CIRun.objects.filter(team_id=team_id)
    if repo_id:
        qs = qs.filter(repo_id=repo_id)
    if branch:
        qs = qs.filter(branch=branch)
    if workflow_name:
        qs = qs.filter(workflow_name=workflow_name)
    return qs.order_by("-completed_at")[:limit]


def get_ci_run(*, run_id: uuid.UUID, team_id: int) -> CIRun:
    return CIRun.objects.get(id=run_id, team_id=team_id)


# --- Test Cases ---


def list_tests_needing_attention(
    *,
    team_id: int,
    repo_id: uuid.UUID | None = None,
    suite: str | None = None,
    min_flake_score: float = 0.0,
    limit: int = 50,
) -> QuerySet[TestCase]:
    qs = TestCase.objects.filter(team_id=team_id, flake_score__gt=min_flake_score)
    if repo_id:
        qs = qs.filter(repo_id=repo_id)
    if suite:
        qs = qs.filter(suite=suite)
    return qs.order_by("-flake_score")[:limit]


def get_test_case(*, test_case_id: uuid.UUID, team_id: int) -> TestCase:
    return TestCase.objects.get(id=test_case_id, team_id=team_id)


def get_test_executions(*, test_case_id: uuid.UUID, team_id: int, limit: int = 100) -> QuerySet[TestExecution]:
    return (
        TestExecution.objects.filter(test_case_id=test_case_id, ci_run__team_id=team_id)
        .select_related("ci_run")
        .order_by("-created_at")[:limit]
    )


# --- Flake Score ---


def update_flake_scores(*, repo_id: uuid.UUID, team_id: int) -> None:
    """Recompute rolling 30-day flake scores for all tests in a repo."""
    cutoff = timezone.now() - datetime.timedelta(days=30)

    test_cases = TestCase.objects.filter(repo_id=repo_id, team_id=team_id)
    for tc in test_cases:
        recent = TestExecution.objects.filter(test_case=tc, created_at__gte=cutoff)
        total = recent.count()
        if total == 0:
            continue

        flaky_count = recent.filter(status=TestExecutionStatus.FLAKY).count()
        tc.flake_score = round((flaky_count / total) * 100, 2)
        tc.total_runs = total
        tc.total_flakes = flaky_count
        tc.save(update_fields=["flake_score", "total_runs", "total_flakes", "last_seen_at"])


# --- Master Streak ---


def get_or_create_main_streak(*, repo_id: uuid.UUID, team_id: int) -> MainStreak:
    streak, _ = MainStreak.objects.get_or_create(
        repo_id=repo_id,
        team_id=team_id,
    )
    return streak


def record_main_branch_run(*, repo_id: uuid.UUID, team_id: int, conclusion: str, workflow_name: str) -> MainStreak:
    """Update the master streak based on a completed run on the default branch."""
    streak = get_or_create_main_streak(repo_id=repo_id, team_id=team_id)
    now = timezone.now()

    if conclusion in ("failure", "timed_out"):
        # Master is broken
        if streak.current_streak_started_at is not None:
            # Was healthy — record the ending streak
            streak_days = (now - streak.current_streak_started_at).days
            if streak_days > streak.record_streak_days:
                streak.record_streak_days = streak_days
                streak.record_streak_start = streak.current_streak_started_at
                streak.record_streak_end = now

        streak.current_streak_started_at = None
        streak.last_broken_at = now
        workflows = streak.last_incident_workflows or []
        if workflow_name not in workflows:
            workflows.append(workflow_name)
        streak.last_incident_workflows = workflows

    elif conclusion == "success":
        if streak.current_streak_started_at is None:
            # Was broken — now recovered
            streak.current_streak_started_at = now
            streak.last_incident_workflows = []

    streak.save()
    return streak


# --- Health Stats ---


def get_health_stats(*, repo_id: uuid.UUID, team_id: int) -> dict:
    cutoff = timezone.now() - datetime.timedelta(days=7)

    runs_7d = CIRun.objects.filter(repo_id=repo_id, team_id=team_id, completed_at__gte=cutoff)
    total_runs = runs_7d.count()

    flaky_executions_7d = TestExecution.objects.filter(
        ci_run__repo_id=repo_id,
        ci_run__team_id=team_id,
        created_at__gte=cutoff,
        status=TestExecutionStatus.FLAKY,
    )
    total_flaky = flaky_executions_7d.values("test_case_id").distinct().count()

    total_executions_7d = TestExecution.objects.filter(
        ci_run__repo_id=repo_id,
        ci_run__team_id=team_id,
        created_at__gte=cutoff,
    ).count()

    flake_rate = flaky_executions_7d.count() / total_executions_7d if total_executions_7d > 0 else 0.0

    tests_needing_attention = TestCase.objects.filter(repo_id=repo_id, team_id=team_id, flake_score__gt=0).count()

    active_quarantines = Quarantine.objects.filter(
        team_id=team_id, test_case__repo_id=repo_id, state=QuarantineState.ACTIVE
    ).count()

    return {
        "flake_rate_7d": round(flake_rate, 4),
        "total_runs_7d": total_runs,
        "total_flaky_tests_7d": total_flaky,
        "tests_needing_attention": tests_needing_attention,
        "active_quarantines": active_quarantines,
    }


# --- Quarantine ---


def create_quarantine(
    *,
    team_id: int,
    test_case_id: uuid.UUID,
    reason: str,
    created_by_id: int,
    create_github_issue: bool = True,
) -> Quarantine:
    test_case = TestCase.objects.get(id=test_case_id, team_id=team_id)

    q = Quarantine.objects.create(
        team_id=team_id,
        test_case=test_case,
        reason=reason,
        created_by_id=created_by_id,
        state=QuarantineState.ACTIVE,
    )

    # GitHub issue creation is handled asynchronously via Celery task
    if create_github_issue:
        from .tasks.tasks import create_quarantine_github_issue

        create_quarantine_github_issue.delay(quarantine_id=str(q.id))

    return q


def resolve_quarantine(*, quarantine_id: uuid.UUID, resolved_by_id: int) -> Quarantine:
    q = Quarantine.objects.get(id=quarantine_id)
    q.state = QuarantineState.RESOLVED
    q.resolved_at = timezone.now()
    q.resolved_by_id = resolved_by_id
    q.save(update_fields=["state", "resolved_at", "resolved_by_id"])
    return q
