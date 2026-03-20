"""
Celery tasks for ci_monitoring.

Async entrypoints for artifact ingestion and GitHub integration.
"""

import uuid

from celery import shared_task


@shared_task(ignore_result=True)
def ingest_ci_run_artifacts(*, ci_run_id: str) -> None:
    """Download and parse test artifacts for a CI run."""
    # Phase 2: will download JUnit XML / Playwright JSON from GitHub
    # and create TestExecution records
    pass


@shared_task(ignore_result=True)
def create_quarantine_github_issue(*, quarantine_id: str) -> None:
    """Create a GitHub issue for a quarantined test."""
    # Phase 4: will use GitHubIntegration to create an issue
    pass


@shared_task(ignore_result=True)
def update_flake_scores(*, repo_id: str, team_id: int) -> None:
    """Recompute rolling 30-day flake scores for all tests in a repo."""
    from .. import logic

    logic.update_flake_scores(repo_id=uuid.UUID(repo_id), team_id=team_id)
