"""
Integration tests for the Rust feature flags service using Django-serialized data.

These tests create cohorts and flags via the Django API (ensuring realistic serialization
including cohort_type, bytecode, etc.) and then call the Rust /flags endpoint to verify
correct flag evaluation.

This approach catches regressions where test data created via raw DB inserts doesn't
match production serialization behavior - specifically the cohort_type computation
that determines how cohorts are evaluated at runtime.

To run these tests locally:
    1. Start the Rust flags service: cd rust/feature-flags && cargo run
    2. Run the tests: pytest posthog/api/test/test_feature_flag_rust_integration.py -v

In CI, these tests require FEATURE_FLAGS_SERVICE_URL to point to a running Rust service.
"""

import os
from collections.abc import Generator
from typing import Any

import pytest
from posthog.test.base import NonAtomicBaseTest

import requests
from rest_framework.test import APIClient

from posthog.models import Cohort, Person
from posthog.models.cohort.cohort import CohortType


@pytest.fixture(scope="module")
def rust_flags_server() -> Generator[str, None, None]:
    """
    Connect to an external Rust feature flags server for integration tests.

    Requires FEATURE_FLAGS_SERVICE_URL to be set and pointing to a running server.

    To run locally:
        1. Start the Rust server:
           cd rust/feature-flags
           READ_DATABASE_URL=postgres://posthog:posthog@localhost:5432/test_posthog \\
           WRITE_DATABASE_URL=postgres://posthog:posthog@localhost:5432/test_posthog \\
           cargo run --bin feature-flags

        2. Run tests:
           SKIP_RUST_INTEGRATION_TESTS=0 \\
           FEATURE_FLAGS_SERVICE_URL=http://127.0.0.1:3001 \\
           pytest posthog/api/test/test_feature_flag_rust_integration.py -v
    """
    server_url = os.environ.get("FEATURE_FLAGS_SERVICE_URL")

    if not server_url:
        pytest.skip(
            "FEATURE_FLAGS_SERVICE_URL not set. "
            "Start the Rust flags server and set FEATURE_FLAGS_SERVICE_URL to run these tests."
        )

    # Verify the server is actually running
    try:
        response = requests.get(f"{server_url}/_readiness", timeout=5)
        if response.status_code != 200:
            pytest.skip(f"Rust flags server at {server_url} returned status {response.status_code}")
    except requests.RequestException as e:
        pytest.skip(f"Rust flags server at {server_url} is not reachable: {e}")

    yield server_url


def create_cohort_via_api(client, team_id: int, name: str, filters: dict[str, Any]) -> dict[str, Any]:
    """
    Create a cohort via the Django API, ensuring proper serialization.

    This goes through CohortSerializer which computes cohort_type, bytecode, etc.
    """
    import json

    from unittest.mock import patch

    # Patch on_commit to run synchronously (avoids Celery task dispatch issues in tests)
    with patch("django.db.transaction.on_commit", side_effect=lambda func: func()):
        response = client.post(
            f"/api/projects/{team_id}/cohorts/",
            {"name": name, "filters": json.dumps(filters)},
            format="multipart",
        )

    assert response.status_code == 201, f"Failed to create cohort: {response.content}"
    return response.json()


def create_flag_via_api(
    client,
    team_id: int,
    key: str,
    filters: dict[str, Any],
    name: str | None = None,
) -> dict[str, Any]:
    """
    Create a feature flag via the Django API, ensuring proper serialization.
    """
    response = client.post(
        f"/api/projects/{team_id}/feature_flags/",
        {
            "key": key,
            "name": name or key,
            "filters": filters,
            "active": True,
        },
        format="json",
    )

    assert response.status_code == 201, f"Failed to create flag: {response.content}"
    return response.json()


def call_flags_endpoint(
    server_url: str,
    token: str,
    distinct_id: str,
    person_properties: dict[str, Any] | None = None,
    groups: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Call the Rust /flags endpoint and return the response."""
    payload: dict[str, Any] = {
        "token": token,
        "distinct_id": distinct_id,
    }
    if person_properties:
        payload["person_properties"] = person_properties
    if groups:
        payload["groups"] = groups

    response = requests.post(
        f"{server_url}/flags",
        params={"v": "2"},
        json=payload,
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


@pytest.mark.skipif(
    os.environ.get("SKIP_RUST_INTEGRATION_TESTS", "1") == "1",
    reason="Rust integration tests require SKIP_RUST_INTEGRATION_TESTS=0",
)
class TestFeatureFlagRustIntegration(NonAtomicBaseTest):
    """
    Integration tests that verify the Rust /flags endpoint correctly handles
    cohorts created via the Django API with proper serialization.

    These tests specifically target the regression where cohort_type=None in
    test data caused realtime cohorts to be incorrectly evaluated.

    Uses TransactionTestCase (via NonAtomicBaseTest) so data is committed
    and visible to the external Rust server process.
    """

    def setUp(self):
        super().setUp()
        # Set up DRF API client for making authenticated requests
        self.client = APIClient()
        self.client.force_login(self.user)

    @pytest.fixture(autouse=True)
    def setup_rust_server(self, rust_flags_server):
        """Inject the Rust server URL into each test."""
        self.rust_server_url = rust_flags_server

    def test_realtime_cohort_with_person_property_filter(self):
        """
        A cohort with person-property filters gets cohort_type='realtime' from
        the Django serializer. The Rust endpoint must correctly evaluate membership.

        This is the exact scenario that regressed in PR #51002.
        """
        # Create person with matching email
        Person.objects.create(
            team=self.team,
            distinct_ids=["realtime_user"],
            properties={"email": "user@posthog.com"},
        )

        # Create cohort via API - this sets cohort_type correctly
        cohort_data = create_cohort_via_api(
            self.client,
            self.team.id,
            "PostHog Email Users",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [
                                {
                                    "key": "email",
                                    "type": "person",
                                    "value": "@posthog.com",
                                    "operator": "icontains",
                                }
                            ],
                        }
                    ],
                }
            },
        )

        # Verify Django set cohort_type to realtime
        cohort = Cohort.objects.get(id=cohort_data["id"])
        assert cohort.cohort_type == CohortType.REALTIME, (
            f"Expected cohort_type='realtime', got '{cohort.cohort_type}'. "
            "This indicates the Django serializer behavior has changed."
        )

        # Create flag targeting the cohort
        create_flag_via_api(
            self.client,
            self.team.id,
            "realtime-cohort-flag",
            {
                "groups": [
                    {
                        "properties": [
                            {
                                "key": "id",
                                "type": "cohort",
                                "value": cohort.id,
                            }
                        ],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Call Rust /flags endpoint - matching user
        result = call_flags_endpoint(
            self.rust_server_url,
            self.team.api_token,
            "realtime_user",
        )

        assert result.get("errorsWhileComputingFlags") is False
        flags = result.get("flags", {})
        flag_value = flags.get("realtime-cohort-flag", {})
        assert flag_value.get("enabled") is True, (
            f"Expected flag to be enabled for user in realtime cohort, got: {flag_value}"
        )

        # Call Rust /flags endpoint - non-matching user
        Person.objects.create(
            team=self.team,
            distinct_ids=["non_matching_user"],
            properties={"email": "user@gmail.com"},
        )

        result = call_flags_endpoint(
            self.rust_server_url,
            self.team.api_token,
            "non_matching_user",
        )

        assert result.get("errorsWhileComputingFlags") is False
        flags = result.get("flags", {})
        flag_value = flags.get("realtime-cohort-flag", {})
        assert flag_value.get("enabled") is False, (
            f"Expected flag to be disabled for user not in cohort, got: {flag_value}"
        )

    def test_realtime_cohort_with_multiple_conditions(self):
        """
        A cohort with multiple AND conditions should still be classified as
        realtime if all conditions support bytecode evaluation.
        """
        # Create person matching all conditions
        Person.objects.create(
            team=self.team,
            distinct_ids=["multi_match"],
            properties={
                "email": "dev@posthog.com",
                "plan": "enterprise",
                "country": "US",
            },
        )

        # Create person matching only some conditions
        Person.objects.create(
            team=self.team,
            distinct_ids=["partial_match"],
            properties={
                "email": "dev@posthog.com",
                "plan": "free",  # Different plan
                "country": "US",
            },
        )

        # Create cohort via API
        cohort_data = create_cohort_via_api(
            self.client,
            self.team.id,
            "Enterprise PostHog US",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [
                                {"key": "email", "type": "person", "value": "@posthog.com", "operator": "icontains"},
                                {"key": "plan", "type": "person", "value": "enterprise", "operator": "exact"},
                                {"key": "country", "type": "person", "value": "US", "operator": "exact"},
                            ],
                        }
                    ],
                }
            },
        )

        cohort = Cohort.objects.get(id=cohort_data["id"])
        assert cohort.cohort_type == CohortType.REALTIME

        # Create flag
        create_flag_via_api(
            self.client,
            self.team.id,
            "multi-condition-flag",
            {
                "groups": [
                    {
                        "properties": [{"key": "id", "type": "cohort", "value": cohort.id}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Full match - should be enabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "multi_match")
        assert result["flags"]["multi-condition-flag"]["enabled"] is True

        # Partial match - should be disabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "partial_match")
        assert result["flags"]["multi-condition-flag"]["enabled"] is False

    def test_realtime_cohort_with_regex_and_negation(self):
        """
        Cohorts with regex and negation filters should be properly classified
        as realtime and evaluated correctly by the Rust service.
        """
        # Should match: email matches regex, not excluded
        Person.objects.create(
            team=self.team,
            distinct_ids=["good_user"],
            properties={"email": "test.user@example.com"},
        )

        # Should NOT match: excluded by negation
        Person.objects.create(
            team=self.team,
            distinct_ids=["excluded_user"],
            properties={"email": "excluded.user@example.com"},
        )

        cohort_data = create_cohort_via_api(
            self.client,
            self.team.id,
            "Example Domain (excluding specific user)",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [
                                {"key": "email", "type": "person", "value": "^.*@example.com$", "operator": "regex"},
                                {
                                    "key": "email",
                                    "type": "person",
                                    "value": "excluded.user@example.com",
                                    "operator": "icontains",
                                    "negation": True,
                                },
                            ],
                        }
                    ],
                }
            },
        )

        cohort = Cohort.objects.get(id=cohort_data["id"])
        assert cohort.cohort_type == CohortType.REALTIME

        create_flag_via_api(
            self.client,
            self.team.id,
            "regex-negation-flag",
            {
                "groups": [
                    {
                        "properties": [{"key": "id", "type": "cohort", "value": cohort.id}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Good user matches
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "good_user")
        assert result["flags"]["regex-negation-flag"]["enabled"] is True

        # Excluded user doesn't match
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "excluded_user")
        assert result["flags"]["regex-negation-flag"]["enabled"] is False

    def test_nested_realtime_cohorts(self):
        """
        Nested cohort references should be handled correctly when both
        cohorts are realtime.
        """
        # User matching both inner and outer
        Person.objects.create(
            team=self.team,
            distinct_ids=["nested_match"],
            properties={"email": "dev@posthog.com", "days_since_paid_plan_start": 77},
        )

        # User matching inner but not outer
        Person.objects.create(
            team=self.team,
            distinct_ids=["inner_only"],
            properties={"email": "dev@posthog.com", "days_since_paid_plan_start": 500},
        )

        # Inner cohort: @posthog.com emails
        inner_cohort = create_cohort_via_api(
            self.client,
            self.team.id,
            "PostHog Emails",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [
                                {"key": "email", "type": "person", "value": "@posthog.com", "operator": "icontains"}
                            ],
                        }
                    ],
                }
            },
        )

        # Outer cohort: in inner cohort AND days < 365
        outer_cohort = create_cohort_via_api(
            self.client,
            self.team.id,
            "Recent PostHog Users",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [
                                {"key": "id", "type": "cohort", "value": inner_cohort["id"]},
                                {
                                    "key": "days_since_paid_plan_start",
                                    "type": "person",
                                    "value": "365",
                                    "operator": "lt",
                                },
                            ],
                        }
                    ],
                }
            },
        )

        create_flag_via_api(
            self.client,
            self.team.id,
            "nested-cohort-flag",
            {
                "groups": [
                    {
                        "properties": [{"key": "id", "type": "cohort", "value": outer_cohort["id"]}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Matches both - enabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "nested_match")
        assert result["flags"]["nested-cohort-flag"]["enabled"] is True

        # Matches inner only - disabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "inner_only")
        assert result["flags"]["nested-cohort-flag"]["enabled"] is False

    def test_realtime_cohort_with_negated_cohort_reference(self):
        """
        A flag that requires being IN one cohort AND NOT IN another cohort.
        Both cohorts are realtime (person-property filters).
        """
        # User in include cohort only
        Person.objects.create(
            team=self.team,
            distinct_ids=["include_only"],
            properties={"plan": "enterprise", "is_competitor": False},
        )

        # User in both cohorts (should be excluded)
        Person.objects.create(
            team=self.team,
            distinct_ids=["in_both"],
            properties={"plan": "enterprise", "is_competitor": True},
        )

        # User in neither
        Person.objects.create(
            team=self.team,
            distinct_ids=["in_neither"],
            properties={"plan": "free", "is_competitor": False},
        )

        # Include cohort: enterprise users
        include_cohort = create_cohort_via_api(
            self.client,
            self.team.id,
            "Enterprise Users",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [{"key": "plan", "type": "person", "value": "enterprise", "operator": "exact"}],
                        }
                    ],
                }
            },
        )

        # Exclude cohort: competitors
        exclude_cohort = create_cohort_via_api(
            self.client,
            self.team.id,
            "Competitors",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [{"key": "is_competitor", "type": "person", "value": True, "operator": "exact"}],
                        }
                    ],
                }
            },
        )

        # Flag: in include cohort AND NOT in exclude cohort
        create_flag_via_api(
            self.client,
            self.team.id,
            "enterprise-non-competitor-flag",
            {
                "groups": [
                    {
                        "properties": [
                            {"key": "id", "type": "cohort", "value": include_cohort["id"]},
                            {"key": "id", "type": "cohort", "value": exclude_cohort["id"], "negation": True},
                        ],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Include only - enabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "include_only")
        assert result["flags"]["enterprise-non-competitor-flag"]["enabled"] is True

        # In both (excluded) - disabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "in_both")
        assert result["flags"]["enterprise-non-competitor-flag"]["enabled"] is False

        # In neither - disabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "in_neither")
        assert result["flags"]["enterprise-non-competitor-flag"]["enabled"] is False

    def test_realtime_cohort_with_date_filter(self):
        """
        Cohorts with date comparison filters should be classified as realtime
        and evaluated correctly.
        """
        # User created recently (within 30 days)
        Person.objects.create(
            team=self.team,
            distinct_ids=["recent_user"],
            properties={"created_at": "2024-01-15", "is_active": True},
        )

        # User created long ago
        Person.objects.create(
            team=self.team,
            distinct_ids=["old_user"],
            properties={"created_at": "2020-01-01", "is_active": True},
        )

        cohort_data = create_cohort_via_api(
            self.client,
            self.team.id,
            "Users Created After 2024",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [
                                {
                                    "key": "created_at",
                                    "type": "person",
                                    "value": "2024-01-01",
                                    "operator": "is_date_after",
                                }
                            ],
                        }
                    ],
                }
            },
        )

        cohort = Cohort.objects.get(id=cohort_data["id"])
        assert cohort.cohort_type == CohortType.REALTIME

        create_flag_via_api(
            self.client,
            self.team.id,
            "date-filter-flag",
            {
                "groups": [
                    {
                        "properties": [{"key": "id", "type": "cohort", "value": cohort.id}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Recent user - enabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "recent_user")
        assert result["flags"]["date-filter-flag"]["enabled"] is True

        # Old user - disabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "old_user")
        assert result["flags"]["date-filter-flag"]["enabled"] is False

    def test_super_condition_with_realtime_cohort(self):
        """
        Super conditions (early exit conditions) with realtime cohorts should
        be evaluated correctly. Super conditions allow flags to return early
        for specific cohorts.
        """
        # Beta tester (should get early access via super condition)
        Person.objects.create(
            team=self.team,
            distinct_ids=["beta_tester"],
            properties={"is_beta_tester": True, "plan": "free"},
        )

        # Regular enterprise user (normal flag evaluation)
        Person.objects.create(
            team=self.team,
            distinct_ids=["enterprise_user"],
            properties={"is_beta_tester": False, "plan": "enterprise"},
        )

        # Regular free user (should not match)
        Person.objects.create(
            team=self.team,
            distinct_ids=["free_user"],
            properties={"is_beta_tester": False, "plan": "free"},
        )

        # Beta testers cohort (for super condition)
        beta_cohort = create_cohort_via_api(
            self.client,
            self.team.id,
            "Beta Testers",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [{"key": "is_beta_tester", "type": "person", "value": True, "operator": "exact"}],
                        }
                    ],
                }
            },
        )

        # Flag with super condition for beta testers
        create_flag_via_api(
            self.client,
            self.team.id,
            "new-feature-flag",
            {
                "super_groups": [
                    {
                        "properties": [{"key": "id", "type": "cohort", "value": beta_cohort["id"]}],
                        "rollout_percentage": 100,
                    }
                ],
                "groups": [
                    {
                        "properties": [{"key": "plan", "type": "person", "value": "enterprise", "operator": "exact"}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Beta tester - enabled via super condition
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "beta_tester")
        assert result["flags"]["new-feature-flag"]["enabled"] is True

        # Enterprise user - enabled via normal groups
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "enterprise_user")
        assert result["flags"]["new-feature-flag"]["enabled"] is True

        # Free user - disabled (not beta, not enterprise)
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "free_user")
        assert result["flags"]["new-feature-flag"]["enabled"] is False

    def test_static_cohort_membership(self):
        """
        Static cohorts (is_static=True) should be evaluated via the
        cohortpeople table, not via property matching.
        """
        # Create persons
        Person.objects.create(
            team=self.team,
            distinct_ids=["static_member"],
            properties={"email": "member@example.com"},
        )

        Person.objects.create(
            team=self.team,
            distinct_ids=["non_member"],
            properties={"email": "nonmember@example.com"},
        )

        # Create static cohort via API
        cohort_data = create_cohort_via_api(
            self.client,
            self.team.id,
            "Static VIP Users",
            {"properties": {"type": "OR", "values": []}},  # Empty filters for static
        )

        # Manually add person to static cohort
        cohort = Cohort.objects.get(id=cohort_data["id"])
        cohort.is_static = True
        cohort.save()
        cohort.insert_users_by_list(["static_member"])

        create_flag_via_api(
            self.client,
            self.team.id,
            "static-cohort-flag",
            {
                "groups": [
                    {
                        "properties": [{"key": "id", "type": "cohort", "value": cohort.id}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Member - enabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "static_member")
        assert result["flags"]["static-cohort-flag"]["enabled"] is True

        # Non-member - disabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "non_member")
        assert result["flags"]["static-cohort-flag"]["enabled"] is False
