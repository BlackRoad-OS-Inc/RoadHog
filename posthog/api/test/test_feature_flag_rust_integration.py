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
from datetime import datetime, timedelta
from typing import Any

import pytest
from posthog.test.base import NonAtomicBaseTest
from unittest.mock import patch

from django.test import Client

import requests
from rest_framework.test import APIClient

from posthog.models import Cohort, FeatureFlag, Person
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


def create_cohort_via_api(
    client: Client | APIClient, team_id: int, name: str, filters: dict[str, Any]
) -> dict[str, Any]:
    """
    Create a cohort via the Django API, ensuring proper serialization.

    This goes through CohortSerializer which computes cohort_type, bytecode, etc.
    """
    import json

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
    client: Client | APIClient,
    team_id: int,
    key: str,
    filters: dict[str, Any],
    name: str | None = None,
    active: bool = True,
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
            "active": active,
        },
        format="json",
    )

    assert response.status_code == 201, f"Failed to create flag: {response.content}"
    return response.json()


class RustFlagsError(Exception):
    """Custom exception for Rust flags endpoint errors with detailed context."""

    def __init__(self, message: str, status_code: int, response_body: str, payload: dict[str, Any]):
        self.status_code = status_code
        self.response_body = response_body
        self.payload = payload
        super().__init__(f"{message} (status={status_code}): {response_body}\nPayload: {payload}")


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

    try:
        response = requests.post(
            f"{server_url}/flags",
            params={"v": "2"},
            json=payload,
            timeout=10,
        )
        response.raise_for_status()
        return response.json()
    except requests.HTTPError as e:
        raise RustFlagsError(
            message="Rust flags endpoint returned error",
            status_code=e.response.status_code if e.response is not None else 0,
            response_body=e.response.text if e.response is not None else str(e),
            payload=payload,
        ) from e


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

        # Track created entities for cleanup
        self._created_cohort_ids: list[int] = []
        self._created_flag_ids: list[int] = []
        self._created_person_distinct_ids: list[str] = []

    def tearDown(self):
        """Clean up test data to ensure isolation between test runs."""
        # Delete created flags
        if self._created_flag_ids:
            FeatureFlag.objects.filter(id__in=self._created_flag_ids).delete()

        # Delete created cohorts
        if self._created_cohort_ids:
            Cohort.objects.filter(id__in=self._created_cohort_ids).delete()

        # Delete created persons
        if self._created_person_distinct_ids:
            Person.objects.filter(
                team=self.team,
                persondistinctid__distinct_id__in=self._created_person_distinct_ids,
            ).delete()

        super().tearDown()

    @pytest.fixture(autouse=True)
    def setup_rust_server(self, rust_flags_server):
        """Inject the Rust server URL into each test."""
        self.rust_server_url = rust_flags_server

    def _create_person(self, distinct_ids: list[str], properties: dict[str, Any]) -> Person:
        """Helper to create a person and track for cleanup."""
        person = Person.objects.create(
            team=self.team,
            distinct_ids=distinct_ids,
            properties=properties,
        )
        self._created_person_distinct_ids.extend(distinct_ids)
        return person

    def _create_cohort(self, name: str, filters: dict[str, Any]) -> dict[str, Any]:
        """Helper to create a cohort via API and track for cleanup."""
        cohort_data = create_cohort_via_api(self.client, self.team.id, name, filters)
        self._created_cohort_ids.append(cohort_data["id"])
        return cohort_data

    def _create_flag(
        self,
        key: str,
        filters: dict[str, Any],
        name: str | None = None,
        active: bool = True,
    ) -> dict[str, Any]:
        """Helper to create a flag via API and track for cleanup."""
        flag_data = create_flag_via_api(self.client, self.team.id, key, filters, name, active)
        self._created_flag_ids.append(flag_data["id"])
        return flag_data

    def test_realtime_cohort_with_person_property_filter(self):
        """
        A cohort defined only by person property filters should be classified
        as realtime (cohort_type=2) and evaluated in real-time by the Rust
        service rather than requiring pre-computation.
        """
        # User who matches the cohort criteria
        self._create_person(
            distinct_ids=["user1"],
            properties={"email": "test@posthog.com", "plan": "enterprise"},
        )

        # User who doesn't match
        self._create_person(
            distinct_ids=["user2"],
            properties={"email": "test@other.com", "plan": "free"},
        )

        # Create cohort via API - this will go through the serializer and compute cohort_type
        cohort_data = self._create_cohort(
            "PostHog Enterprise Users",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [
                                {"key": "email", "type": "person", "value": "@posthog.com", "operator": "icontains"},
                                {"key": "plan", "type": "person", "value": "enterprise", "operator": "exact"},
                            ],
                        }
                    ],
                }
            },
        )

        # Verify the cohort was classified as realtime
        cohort = Cohort.objects.get(id=cohort_data["id"])
        assert cohort.cohort_type == CohortType.REALTIME, (
            f"Expected cohort_type={CohortType.REALTIME} (realtime), got {cohort.cohort_type}"
        )

        # Create a flag that uses this cohort
        self._create_flag(
            "enterprise-feature",
            {
                "groups": [
                    {
                        "properties": [{"key": "id", "type": "cohort", "value": cohort.id}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # User 1 (matches cohort) - should have flag enabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "user1")
        assert result["flags"]["enterprise-feature"]["enabled"] is True

        # User 2 (doesn't match cohort) - should have flag disabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "user2")
        assert result["flags"]["enterprise-feature"]["enabled"] is False

    def test_realtime_cohort_with_multiple_conditions(self):
        """
        Test a realtime cohort with multiple OR conditions, each with AND properties.
        """
        # Premium user
        self._create_person(
            distinct_ids=["premium_user"],
            properties={"subscription": "premium", "country": "US"},
        )

        # Enterprise user
        self._create_person(
            distinct_ids=["enterprise_user"],
            properties={"subscription": "enterprise", "country": "UK"},
        )

        # Free user (doesn't match)
        self._create_person(
            distinct_ids=["free_user"],
            properties={"subscription": "free", "country": "US"},
        )

        cohort_data = self._create_cohort(
            "Paid Users",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [
                                {"key": "subscription", "type": "person", "value": "premium", "operator": "exact"}
                            ],
                        },
                        {
                            "type": "AND",
                            "values": [
                                {"key": "subscription", "type": "person", "value": "enterprise", "operator": "exact"}
                            ],
                        },
                    ],
                }
            },
        )

        cohort = Cohort.objects.get(id=cohort_data["id"])
        assert cohort.cohort_type == CohortType.REALTIME

        self._create_flag(
            "paid-feature",
            {
                "groups": [
                    {
                        "properties": [{"key": "id", "type": "cohort", "value": cohort.id}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Premium user - enabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "premium_user")
        assert result["flags"]["paid-feature"]["enabled"] is True

        # Enterprise user - enabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "enterprise_user")
        assert result["flags"]["paid-feature"]["enabled"] is True

        # Free user - disabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "free_user")
        assert result["flags"]["paid-feature"]["enabled"] is False

    def test_realtime_cohort_with_regex_and_negation(self):
        """
        Test realtime cohorts with regex matching and negation operators.
        """
        # User with valid email domain
        self._create_person(
            distinct_ids=["valid_domain"],
            properties={"email": "user@company.com", "status": "active"},
        )

        # User with excluded domain
        self._create_person(
            distinct_ids=["excluded_domain"],
            properties={"email": "user@gmail.com", "status": "active"},
        )

        cohort_data = self._create_cohort(
            "Business Email Users",
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
                                    "value": "@(gmail|yahoo|hotmail)\\.com$",
                                    "operator": "not_regex",
                                },
                                {"key": "status", "type": "person", "value": "active", "operator": "exact"},
                            ],
                        }
                    ],
                }
            },
        )

        cohort = Cohort.objects.get(id=cohort_data["id"])
        assert cohort.cohort_type == CohortType.REALTIME

        self._create_flag(
            "business-feature",
            {
                "groups": [
                    {
                        "properties": [{"key": "id", "type": "cohort", "value": cohort.id}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Valid business email - enabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "valid_domain")
        assert result["flags"]["business-feature"]["enabled"] is True

        # Gmail user - disabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "excluded_domain")
        assert result["flags"]["business-feature"]["enabled"] is False

    def test_nested_realtime_cohorts(self):
        """
        Test a flag with nested cohort references - a cohort that references
        another cohort. Both should be classified correctly as realtime.
        """
        # User matching both cohorts
        self._create_person(
            distinct_ids=["both_match"],
            properties={"country": "US", "verified": True},
        )

        # User matching only outer condition
        self._create_person(
            distinct_ids=["outer_only"],
            properties={"country": "US", "verified": False},
        )

        # User matching only inner condition
        self._create_person(
            distinct_ids=["inner_only"],
            properties={"country": "UK", "verified": True},
        )

        # Inner cohort: verified users
        inner_cohort = self._create_cohort(
            "Verified Users",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [{"key": "verified", "type": "person", "value": True, "operator": "exact"}],
                        }
                    ],
                }
            },
        )

        # Outer cohort: US users who are verified
        outer_cohort = self._create_cohort(
            "US Verified Users",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [
                                {"key": "country", "type": "person", "value": "US", "operator": "exact"},
                                {"key": "id", "type": "cohort", "value": inner_cohort["id"]},
                            ],
                        }
                    ],
                }
            },
        )

        cohort = Cohort.objects.get(id=outer_cohort["id"])
        assert cohort.cohort_type == CohortType.REALTIME

        self._create_flag(
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

        # Both match - enabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "both_match")
        assert result["flags"]["nested-cohort-flag"]["enabled"] is True

        # Outer only - disabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "outer_only")
        assert result["flags"]["nested-cohort-flag"]["enabled"] is False

        # Matches inner only - disabled
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "inner_only")
        assert result["flags"]["nested-cohort-flag"]["enabled"] is False

    def test_realtime_cohort_with_negated_cohort_reference(self):
        """
        A flag that requires being IN one cohort AND NOT IN another cohort.
        Both cohorts are realtime (person-property filters).
        """
        # User in include cohort only
        self._create_person(
            distinct_ids=["include_only"],
            properties={"plan": "enterprise", "is_competitor": False},
        )

        # User in both cohorts (should be excluded)
        self._create_person(
            distinct_ids=["in_both"],
            properties={"plan": "enterprise", "is_competitor": True},
        )

        # User in neither
        self._create_person(
            distinct_ids=["in_neither"],
            properties={"plan": "free", "is_competitor": False},
        )

        # Include cohort: enterprise users
        include_cohort = self._create_cohort(
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
        exclude_cohort = self._create_cohort(
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
        self._create_flag(
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
        # Use dynamic dates to avoid stale test data
        recent_date = (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d")
        old_date = (datetime.now() - timedelta(days=1000)).strftime("%Y-%m-%d")
        cutoff_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

        # User created recently (within 30 days)
        self._create_person(
            distinct_ids=["recent_user"],
            properties={"created_at": recent_date, "is_active": True},
        )

        # User created long ago
        self._create_person(
            distinct_ids=["old_user"],
            properties={"created_at": old_date, "is_active": True},
        )

        cohort_data = self._create_cohort(
            "Recently Created Users",
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
                                    "value": cutoff_date,
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

        self._create_flag(
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
        self._create_person(
            distinct_ids=["beta_tester"],
            properties={"is_beta_tester": True, "plan": "free"},
        )

        # Regular enterprise user (normal flag evaluation)
        self._create_person(
            distinct_ids=["enterprise_user"],
            properties={"is_beta_tester": False, "plan": "enterprise"},
        )

        # Regular free user (should not match)
        self._create_person(
            distinct_ids=["free_user"],
            properties={"is_beta_tester": False, "plan": "free"},
        )

        # Beta testers cohort (for super condition)
        beta_cohort = self._create_cohort(
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
        self._create_flag(
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
        self._create_person(
            distinct_ids=["static_member"],
            properties={"email": "member@example.com"},
        )

        self._create_person(
            distinct_ids=["non_member"],
            properties={"email": "nonmember@example.com"},
        )

        # Create static cohort via API
        cohort_data = self._create_cohort(
            "Static VIP Users",
            {"properties": {"type": "OR", "values": []}},  # Empty filters for static
        )

        # Manually add person to static cohort
        cohort = Cohort.objects.get(id=cohort_data["id"])
        cohort.is_static = True
        cohort.save()
        cohort.insert_users_by_list(["static_member"])

        self._create_flag(
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

    def test_unknown_distinct_id(self):
        """
        Test that the Rust service handles unknown distinct_ids correctly.
        When a person doesn't exist, the flag should evaluate based on
        the conditions (likely disabled for cohort-based flags).
        """
        # Create a flag with a cohort condition
        cohort_data = self._create_cohort(
            "Existing Users",
            {
                "properties": {
                    "type": "OR",
                    "values": [
                        {
                            "type": "AND",
                            "values": [{"key": "plan", "type": "person", "value": "pro", "operator": "exact"}],
                        }
                    ],
                }
            },
        )

        self._create_flag(
            "unknown-user-test-flag",
            {
                "groups": [
                    {
                        "properties": [{"key": "id", "type": "cohort", "value": cohort_data["id"]}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Call with a completely unknown distinct_id
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "completely_unknown_user_12345")

        # Flag should be present but disabled (no person record exists)
        assert "unknown-user-test-flag" in result["flags"]
        assert result["flags"]["unknown-user-test-flag"]["enabled"] is False

    def test_multiple_flags_single_request(self):
        """
        Test that multiple flags are correctly evaluated in a single /flags request.
        """
        # Create a person with various properties
        self._create_person(
            distinct_ids=["multi_flag_user"],
            properties={"plan": "enterprise", "country": "US", "beta": True},
        )

        # Create multiple flags with different conditions
        self._create_flag(
            "multi-flag-1-enterprise",
            {
                "groups": [
                    {
                        "properties": [{"key": "plan", "type": "person", "value": "enterprise", "operator": "exact"}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        self._create_flag(
            "multi-flag-2-us-only",
            {
                "groups": [
                    {
                        "properties": [{"key": "country", "type": "person", "value": "US", "operator": "exact"}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        self._create_flag(
            "multi-flag-3-beta",
            {
                "groups": [
                    {
                        "properties": [{"key": "beta", "type": "person", "value": True, "operator": "exact"}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        self._create_flag(
            "multi-flag-4-no-match",
            {
                "groups": [
                    {
                        "properties": [{"key": "plan", "type": "person", "value": "free", "operator": "exact"}],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Single request should return all flags
        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "multi_flag_user")

        # All matching flags should be enabled
        assert result["flags"]["multi-flag-1-enterprise"]["enabled"] is True
        assert result["flags"]["multi-flag-2-us-only"]["enabled"] is True
        assert result["flags"]["multi-flag-3-beta"]["enabled"] is True
        # Non-matching flag should be disabled
        assert result["flags"]["multi-flag-4-no-match"]["enabled"] is False

    def test_disabled_flag(self):
        """
        Test that flags with active=False are correctly skipped by the Rust service.
        """
        self._create_person(
            distinct_ids=["disabled_flag_user"],
            properties={"plan": "enterprise"},
        )

        # Create an active flag
        self._create_flag(
            "active-flag",
            {
                "groups": [
                    {
                        "properties": [{"key": "plan", "type": "person", "value": "enterprise", "operator": "exact"}],
                        "rollout_percentage": 100,
                    }
                ],
            },
            active=True,
        )

        # Create a disabled flag with the same conditions
        self._create_flag(
            "disabled-flag",
            {
                "groups": [
                    {
                        "properties": [{"key": "plan", "type": "person", "value": "enterprise", "operator": "exact"}],
                        "rollout_percentage": 100,
                    }
                ],
            },
            active=False,
        )

        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "disabled_flag_user")

        # Active flag should be enabled
        assert result["flags"]["active-flag"]["enabled"] is True
        # Disabled flag should not be in the response or should be disabled
        assert "disabled-flag" not in result["flags"] or result["flags"]["disabled-flag"]["enabled"] is False

    def test_multivariate_flag(self):
        """
        Test multivariate flags with multiple variants.
        """
        self._create_person(
            distinct_ids=["multivariate_user"],
            properties={"plan": "enterprise"},
        )

        # Create a multivariate flag
        self._create_flag(
            "multivariate-feature",
            {
                "groups": [
                    {
                        "properties": [{"key": "plan", "type": "person", "value": "enterprise", "operator": "exact"}],
                        "rollout_percentage": 100,
                    }
                ],
                "multivariate": {
                    "variants": [
                        {"key": "control", "rollout_percentage": 33},
                        {"key": "test_a", "rollout_percentage": 33},
                        {"key": "test_b", "rollout_percentage": 34},
                    ]
                },
            },
        )

        result = call_flags_endpoint(self.rust_server_url, self.team.api_token, "multivariate_user")

        # Flag should be enabled with a variant value
        assert result["flags"]["multivariate-feature"]["enabled"] is True
        # Variant should be one of the defined variants
        assert result["flags"]["multivariate-feature"]["variant"] in ["control", "test_a", "test_b"]

    def test_group_based_flag(self):
        """
        Test flags that target groups (e.g., organizations) rather than persons.
        """
        self._create_person(
            distinct_ids=["group_user"],
            properties={"email": "user@company.com"},
        )

        # Create a flag that targets a group property
        self._create_flag(
            "group-feature",
            {
                "aggregation_group_type_index": 0,  # Assumes group type 0 is "organization"
                "groups": [
                    {
                        "properties": [
                            {
                                "key": "plan",
                                "type": "group",
                                "value": "enterprise",
                                "operator": "exact",
                                "group_type_index": 0,
                            }
                        ],
                        "rollout_percentage": 100,
                    }
                ],
            },
        )

        # Call with group context
        result = call_flags_endpoint(
            self.rust_server_url,
            self.team.api_token,
            "group_user",
            groups={"organization": "org_123"},
        )

        # The flag should be present in the response
        # (actual result depends on whether the group exists and matches)
        assert "group-feature" in result["flags"]
