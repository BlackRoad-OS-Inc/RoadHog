"""
Rust /flags integration tests — standalone spike.

No Django test framework. Each test:
1. Inserts persons via psycopg2 (persons database)
2. Creates cohorts/flags via Django HTTP API (authenticated with personal API key)
3. Calls Rust /flags endpoint and asserts on the result
"""

from typing import Any

from conftest import DjangoAPI, PersonsDB, TestEnv, evaluate_flags


def _cohort_filters(*and_groups: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "properties": {
            "type": "OR",
            "values": [{"type": "AND", "values": conditions} for conditions in and_groups],
        }
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_realtime_cohort_with_person_properties(persons_db: PersonsDB, api: DjangoAPI, env: TestEnv):
    persons_db.create_person(["user1"], {"email": "test@posthog.com", "plan": "enterprise"})
    persons_db.create_person(["user2"], {"email": "test@other.com", "plan": "free"})

    cohort = api.create_cohort(
        "Enterprise Users",
        _cohort_filters(
            [
                {"key": "email", "type": "person", "value": "@posthog.com", "operator": "icontains"},
                {"key": "plan", "type": "person", "value": "enterprise", "operator": "exact"},
            ],
        ),
    )

    api.create_flag(
        "enterprise-feature",
        {
            "groups": [
                {
                    "properties": [{"key": "id", "type": "cohort", "value": cohort["id"]}],
                    "rollout_percentage": 100,
                }
            ],
        },
    )

    assert evaluate_flags(env.api_token, "user1")["flags"]["enterprise-feature"]["enabled"] is True
    assert evaluate_flags(env.api_token, "user2")["flags"]["enterprise-feature"]["enabled"] is False


def test_multiple_or_conditions(persons_db: PersonsDB, api: DjangoAPI, env: TestEnv):
    persons_db.create_person(["premium"], {"subscription": "premium"})
    persons_db.create_person(["enterprise"], {"subscription": "enterprise"})
    persons_db.create_person(["free"], {"subscription": "free"})

    cohort = api.create_cohort(
        "Paid Users",
        _cohort_filters(
            [{"key": "subscription", "type": "person", "value": "premium", "operator": "exact"}],
            [{"key": "subscription", "type": "person", "value": "enterprise", "operator": "exact"}],
        ),
    )

    api.create_flag(
        "paid-feature",
        {
            "groups": [
                {
                    "properties": [{"key": "id", "type": "cohort", "value": cohort["id"]}],
                    "rollout_percentage": 100,
                }
            ],
        },
    )

    assert evaluate_flags(env.api_token, "premium")["flags"]["paid-feature"]["enabled"] is True
    assert evaluate_flags(env.api_token, "enterprise")["flags"]["paid-feature"]["enabled"] is True
    assert evaluate_flags(env.api_token, "free")["flags"]["paid-feature"]["enabled"] is False


def test_nested_cohorts(persons_db: PersonsDB, api: DjangoAPI, env: TestEnv):
    persons_db.create_person(["both"], {"country": "US", "verified": True})
    persons_db.create_person(["outer_only"], {"country": "US", "verified": False})
    persons_db.create_person(["inner_only"], {"country": "UK", "verified": True})

    inner = api.create_cohort(
        "Verified",
        _cohort_filters([{"key": "verified", "type": "person", "value": True, "operator": "exact"}]),
    )
    outer = api.create_cohort(
        "US Verified",
        _cohort_filters(
            [
                {"key": "country", "type": "person", "value": "US", "operator": "exact"},
                {"key": "id", "type": "cohort", "value": inner["id"]},
            ],
        ),
    )

    api.create_flag(
        "nested-flag",
        {
            "groups": [
                {
                    "properties": [{"key": "id", "type": "cohort", "value": outer["id"]}],
                    "rollout_percentage": 100,
                }
            ],
        },
    )

    assert evaluate_flags(env.api_token, "both")["flags"]["nested-flag"]["enabled"] is True
    assert evaluate_flags(env.api_token, "outer_only")["flags"]["nested-flag"]["enabled"] is False
    assert evaluate_flags(env.api_token, "inner_only")["flags"]["nested-flag"]["enabled"] is False


def test_static_cohort(persons_db: PersonsDB, api: DjangoAPI, env: TestEnv):
    member_id = persons_db.create_person(["member"], {"email": "member@example.com"})
    persons_db.create_person(["nonmember"], {"email": "other@example.com"})

    cohort = api.create_cohort("Static VIPs", _cohort_filters(), is_static=True)
    persons_db.add_to_static_cohort(member_id, cohort["id"])

    api.create_flag(
        "static-flag",
        {
            "groups": [
                {
                    "properties": [{"key": "id", "type": "cohort", "value": cohort["id"]}],
                    "rollout_percentage": 100,
                }
            ],
        },
    )

    assert evaluate_flags(env.api_token, "member")["flags"]["static-flag"]["enabled"] is True
    assert evaluate_flags(env.api_token, "nonmember")["flags"]["static-flag"]["enabled"] is False


def test_group_based_flag(persons_db: PersonsDB, api: DjangoAPI, env: TestEnv):
    persons_db.create_person(["group_user"], {"email": "user@company.com"})
    persons_db.create_group("organization", 0, "org_123", {"plan": "enterprise"})
    persons_db.create_group("organization", 0, "org_456", {"plan": "free"})

    api.create_flag(
        "group-feature",
        {
            "aggregation_group_type_index": 0,
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

    result = evaluate_flags(env.api_token, "group_user", groups={"organization": "org_123"})
    assert result["flags"]["group-feature"]["enabled"] is True

    result = evaluate_flags(env.api_token, "group_user", groups={"organization": "org_456"})
    assert result["flags"]["group-feature"]["enabled"] is False


def test_unknown_distinct_id(api: DjangoAPI, env: TestEnv):
    cohort = api.create_cohort(
        "Any Users",
        _cohort_filters([{"key": "plan", "type": "person", "value": "pro", "operator": "exact"}]),
    )
    api.create_flag(
        "unknown-user-flag",
        {
            "groups": [
                {
                    "properties": [{"key": "id", "type": "cohort", "value": cohort["id"]}],
                    "rollout_percentage": 100,
                }
            ],
        },
    )

    result = evaluate_flags(env.api_token, "totally_unknown_user_xyz")
    assert result["flags"]["unknown-user-flag"]["enabled"] is False


def test_disabled_flag(persons_db: PersonsDB, api: DjangoAPI, env: TestEnv):
    persons_db.create_person(["disabled_user"], {"plan": "enterprise"})

    api.create_flag(
        "active-flag",
        {
            "groups": [
                {
                    "properties": [{"key": "plan", "type": "person", "value": "enterprise", "operator": "exact"}],
                    "rollout_percentage": 100,
                }
            ],
        },
    )
    api.create_flag(
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

    result = evaluate_flags(env.api_token, "disabled_user")
    assert result["flags"]["active-flag"]["enabled"] is True
    assert "disabled-flag" not in result["flags"] or result["flags"]["disabled-flag"]["enabled"] is False
