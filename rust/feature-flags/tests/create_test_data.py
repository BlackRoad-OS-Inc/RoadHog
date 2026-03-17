#!/usr/bin/env python3
"""
Bootstrap Django and create cohorts/feature flags through the real serializers.

Reads JSON from stdin with a list of operations, creates the objects via
CohortSerializer / FeatureFlagSerializer, and outputs JSON to stdout with
the created IDs and key serialized fields.

Used by Rust integration tests to set up realistic test data that goes through
the same validation/bytecode-compilation path as the Django API.
"""

from __future__ import annotations

import os
import re
import sys
import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser

    from rest_framework.request import Request


def bootstrap_django() -> None:
    """Set up Django environment so we can import models and serializers."""
    # The script lives at rust/feature-flags/tests/create_test_data.py
    # Repo root is 3 levels up.
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(script_dir, "..", "..", ".."))

    if repo_root not in sys.path:
        sys.path.insert(0, repo_root)

    # Default to the test database if DATABASE_URL isn't already set.
    if "DATABASE_URL" not in os.environ:
        os.environ["DATABASE_URL"] = "postgres://posthog:posthog@localhost:5432/test_posthog"

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "posthog.settings")

    import django

    try:
        django.setup()
    except Exception as e:
        sys.stderr.write(f"Failed to bootstrap Django: {e}\n")
        sys.stderr.write("Ensure DATABASE_URL points to test_posthog and Django deps are installed.\n")
        sys.exit(1)


def resolve_cohort_placeholders(obj: Any, created_cohorts: list[int]) -> Any:
    """
    Recursively walk *obj* and replace any string matching ``$cohort_<N>``
    with the real cohort ID from ``created_cohorts[N]``.
    Returns a new (deep-copied) object with replacements applied.
    """
    if isinstance(obj, str):
        m = re.fullmatch(r"\$cohort_(\d+)", obj)
        if m:
            idx = int(m.group(1))
            if idx < len(created_cohorts):
                return created_cohorts[idx]
            else:
                raise ValueError(f"$cohort_{idx} referenced but only {len(created_cohorts)} cohorts created so far")
        return obj
    elif isinstance(obj, list):
        return [resolve_cohort_placeholders(item, created_cohorts) for item in obj]
    elif isinstance(obj, dict):
        return {k: resolve_cohort_placeholders(v, created_cohorts) for k, v in obj.items()}
    else:
        return obj


def create_cohort(
    op: dict[str, Any],
    team_id: int,
    user: AbstractUser,
    request: Request,
    created_cohorts: list[int],
) -> dict[str, Any]:
    """Create a cohort via CohortSerializer and return result dict."""
    from unittest.mock import patch

    from posthog.api.cohort import CohortSerializer
    from posthog.models.cohort import Cohort

    cohort_data = {
        "name": op["name"],
        "filters": resolve_cohort_placeholders(op.get("filters", {}), created_cohorts),
        "is_static": op.get("is_static", False),
    }

    # Optional fields
    if "groups" in op:
        cohort_data["groups"] = resolve_cohort_placeholders(op["groups"], created_cohorts)
    if "description" in op:
        cohort_data["description"] = op["description"]

    serializer = CohortSerializer(
        data=cohort_data,
        context={"team_id": team_id, "request": request},
    )
    serializer.is_valid(raise_exception=True)

    # Patch enqueue_calculation to avoid Celery task dispatch
    with patch.object(Cohort, "enqueue_calculation", lambda self: None):
        cohort = serializer.save()

    return {
        "type": "cohort",
        "id": cohort.id,
        "cohort_type": cohort.get_type_display() if hasattr(cohort, "get_type_display") else str(cohort.cohort_type),
        "filters": cohort.filters
        if isinstance(cohort.filters, dict)
        else json.loads(cohort.filters)
        if cohort.filters
        else {},
        "is_static": cohort.is_static,
    }


def create_flag(
    op: dict[str, Any],
    team_id: int,
    user: AbstractUser,
    request: Request,
    created_cohorts: list[int],
) -> dict[str, Any]:
    """Create a feature flag via FeatureFlagSerializer and return result dict."""
    from posthog.api.feature_flag import FeatureFlagSerializer

    filters = resolve_cohort_placeholders(op.get("filters", {}), created_cohorts)

    flag_data = {
        "key": op["key"],
        "name": op.get("name", op["key"]),
        "filters": filters,
        "active": op.get("active", True),
    }

    # Prevent usage dashboard creation during tests
    if "_should_create_usage_dashboard" not in flag_data:
        flag_data["_should_create_usage_dashboard"] = False

    # Optional fields
    if "ensure_experience_continuity" in op:
        flag_data["ensure_experience_continuity"] = op["ensure_experience_continuity"]
    if "rollout_percentage" in op:
        flag_data["rollout_percentage"] = op["rollout_percentage"]

    serializer = FeatureFlagSerializer(
        data=flag_data,
        context={"team_id": team_id, "request": request},
    )
    serializer.is_valid(raise_exception=True)
    flag = serializer.save()

    return {
        "type": "flag",
        "id": flag.id,
        "key": flag.key,
        "filters": flag.filters,
        "active": flag.active,
        "ensure_experience_continuity": flag.ensure_experience_continuity,
    }


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw)
    except Exception as exc:
        sys.stderr.write(f"Failed to parse stdin JSON: {exc}\n")
        sys.exit(1)

    team_id = payload.get("team_id")
    operations = payload.get("operations", [])

    if not team_id:
        sys.stderr.write("team_id is required\n")
        sys.exit(1)

    # ── Bootstrap Django ────────────────────────────────────────────
    bootstrap_django()

    # Now that Django is set up we can import Django-dependent modules.
    from django.contrib.auth import get_user_model

    from rest_framework.test import APIRequestFactory

    User = get_user_model()

    # ── Create or fetch a user for serializer context ───────────────
    user, _ = User.objects.get_or_create(
        email="test-create-data@posthog.com",
        defaults={
            "first_name": "Test",
            "last_name": "DataCreator",
            "password": "unused",
        },
    )

    factory = APIRequestFactory()
    request = factory.post("/fake-url/")
    request.user = user
    # Some serializers peek at request.data
    request.data = {}

    # ── Process operations ──────────────────────────────────────────
    results = []
    created_cohort_ids = []  # index → cohort PK, for $cohort_N resolution

    for i, op in enumerate(operations):
        op_type = op.get("type")
        try:
            if op_type == "create_cohort":
                result = create_cohort(op, team_id, user, request, created_cohort_ids)
                created_cohort_ids.append(result["id"])
                results.append(result)

            elif op_type == "create_flag":
                result = create_flag(op, team_id, user, request, created_cohort_ids)
                results.append(result)

            else:
                raise ValueError(f"Unknown operation type: {op_type}")

        except Exception as exc:
            sys.stderr.write(f"Operation {i} ({op_type}) failed: {exc}\n")
            # Include the error in output so the caller can inspect it
            results.append(
                {
                    "type": "error",
                    "operation_index": i,
                    "operation_type": op_type,
                    "error": str(exc),
                }
            )
            # Bail out — later operations may depend on this one
            output = {"results": results, "error": str(exc)}
            sys.stdout.write(json.dumps(output))
            sys.stdout.write("\n")
            sys.exit(1)

    output = {"results": results}
    sys.stdout.write(json.dumps(output))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
