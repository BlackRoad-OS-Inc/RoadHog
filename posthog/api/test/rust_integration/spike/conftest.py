"""
Fixtures for standalone Rust /flags integration tests.

No Django test framework. Tests use:
- psycopg2 for person/group inserts (database)
- requests for Django API calls (cohorts, flags)
- requests for Rust /flags evaluation

The test environment (org, team, user, API key) is bootstrapped via raw SQL
in a session-scoped fixture — no setup script or JSON file needed.
"""

import os
import json
import uuid
import hashlib
from collections.abc import Generator
from dataclasses import dataclass
from typing import Any

import pytest

import psycopg2
import requests

DJANGO_API_URL = os.environ.get("DJANGO_API_URL", "http://localhost:8000")
RUST_FLAGS_URL = os.environ.get("FEATURE_FLAGS_SERVICE_URL", "http://localhost:3001")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://posthog:posthog@localhost:5432/test_posthog")
# Persons, distinct IDs, and cohort people live in a separate database in production.
# Falls back to the main DB for local dev where everything is in one database.
PERSONS_DATABASE_URL = os.environ.get("PERSONS_DATABASE_URL", DATABASE_URL)

pytestmark = pytest.mark.skipif(
    os.environ.get("SKIP_RUST_INTEGRATION_TESTS", "1") == "1",
    reason="Set SKIP_RUST_INTEGRATION_TESTS=0 to run",
)


@dataclass
class TestEnv:
    team_id: int
    project_id: int
    api_token: str
    personal_api_key: str


def _bootstrap_test_env(conn: Any) -> TestEnv:
    """Create org, project, team, user, and API key via raw SQL."""
    cur = conn.cursor()
    api_token = f"phc_test_{uuid.uuid4().hex}"

    # Organization
    cur.execute(
        """
        INSERT INTO posthog_organization (id, name, created_at, updated_at,
                                           plugins_access_level, for_internal_metrics,
                                           is_member_join_email_enabled, enforce_2fa,
                                           is_hipaa, customer_trust_scores,
                                           product_subscription)
        VALUES (%s, 'Rust Integration Test', now(), now(), 3, false, true, NULL, false, '{}', '{}')
        RETURNING id
        """,
        (str(uuid.uuid4()),),
    )
    org_id = cur.fetchone()[0]

    # Get next team/project ID from the sequence
    cur.execute("SELECT nextval('posthog_team_id_seq')")
    team_id = cur.fetchone()[0]

    # Project
    cur.execute(
        """
        INSERT INTO posthog_project (id, organization_id, name, created_at)
        VALUES (%s, %s, 'Rust Integration', now())
        """,
        (team_id, org_id),
    )

    # Team
    cur.execute(
        """
        INSERT INTO posthog_team (id, uuid, organization_id, project_id, api_token,
                                   name, created_at, updated_at, signup_token,
                                   is_demo, access_control, test_account_filters,
                                   timezone, data_attributes, person_display_name_properties,
                                   inject_web_apps, extra_settings, modifiers,
                                   correlation_config, session_recording_opt_in,
                                   capture_console_log_opt_in, capture_performance_opt_in,
                                   surveys_opt_in, heatmaps_opt_in, session_replay_config,
                                   autocapture_opt_out, autocapture_web_vitals_opt_in,
                                   autocapture_web_vitals_allowed_metrics,
                                   autocapture_exceptions_opt_in,
                                   autocapture_exceptions_errors_to_ignore,
                                   person_processing_opt_out, live_events_token,
                                   external_data_workspace_id, external_data_workspace_last_synced_at,
                                   primary_dashboard_id, default_data_theme)
        VALUES (%s, %s, %s, %s, %s,
                'Rust Integration', now(), now(), NULL,
                false, false, '[]',
                'UTC', '["data-attr"]', '[]',
                false, NULL, NULL,
                NULL, false,
                false, NULL,
                false, false, NULL,
                false, false,
                NULL,
                false,
                NULL,
                false, NULL,
                NULL, NULL,
                NULL, NULL)
        """,
        (team_id, str(uuid.uuid4()), org_id, team_id, api_token),
    )

    # User
    password_hash = "pbkdf2_sha256$260000$test$test="  # not a real hash, just needs to exist
    cur.execute(
        """
        INSERT INTO posthog_user (uuid, email, password, first_name, last_name,
                                   is_staff, is_active, date_joined, is_superuser,
                                   distinct_id, email_opt_in, partial_notification_settings,
                                   anonymize_data, toolbar_mode, events_column_config,
                                   theme_mode, requested_password_reset_at,
                                   has_seen_product_intro_for)
        VALUES (%s, 'rust-test@posthog.com', %s, 'Rust', 'Test',
                false, true, now(), false,
                %s, false, '{}',
                false, 'toolbar_mode'::text, '{"active": "DEFAULT"}',
                NULL, NULL, '{}')
        RETURNING id
        """,
        (str(uuid.uuid4()), password_hash, str(uuid.uuid4())),
    )
    user_id = cur.fetchone()[0]

    # Organization membership
    cur.execute(
        """
        INSERT INTO posthog_organizationmembership (id, organization_id, user_id,
                                                      level, joined_at, updated_at)
        VALUES (%s, %s, %s, 1, now(), now())
        """,
        (str(uuid.uuid4()), org_id, user_id),
    )

    # Personal API key for HTTP authentication
    key_value = f"phx_test_{uuid.uuid4().hex}"
    secure_value = hashlib.sha256(key_value.encode()).hexdigest()
    cur.execute(
        """
        INSERT INTO posthog_personalapikey (id, user_id, label, secure_value, created_at, last_used_at)
        VALUES (%s, %s, 'rust-integration-test', %s, now(), NULL)
        """,
        (str(uuid.uuid4()), user_id, f"sha256${secure_value}"),
    )

    conn.commit()
    return TestEnv(
        team_id=team_id,
        project_id=team_id,
        api_token=api_token,
        personal_api_key=key_value,
    )


@pytest.fixture(scope="session")
def env() -> TestEnv:
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    try:
        return _bootstrap_test_env(conn)
    finally:
        conn.close()


@pytest.fixture(scope="session")
def api_session(env: TestEnv) -> requests.Session:
    """HTTP session authenticated with the personal API key."""
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {env.personal_api_key}"
    return session


# ---------------------------------------------------------------------------
# Persons database helpers
# ---------------------------------------------------------------------------


@dataclass
class TestDB:
    """Thin wrapper around psycopg2 for inserting test entities.

    Manages two connections matching production topology:
    - persons_conn: persons, distinct IDs, cohort people (persons database)
    - main_conn: groups, group type mappings (main database)
    """

    persons_conn: Any  # psycopg2 connection
    main_conn: Any  # psycopg2 connection
    team_id: int

    def create_person(self, distinct_ids: list[str], properties: dict[str, Any]) -> int:
        cur = self.persons_conn.cursor()
        cur.execute(
            """
            INSERT INTO posthog_person (team_id, uuid, properties, created_at,
                                        properties_last_updated_at, properties_last_operation,
                                        is_identified, version)
            VALUES (%s, %s, %s, now(), '{}', '{}', false, 0)
            RETURNING id
            """,
            (self.team_id, str(uuid.uuid4()), json.dumps(properties)),
        )
        person_id = cur.fetchone()[0]
        for did in distinct_ids:
            cur.execute(
                """
                INSERT INTO posthog_persondistinctid (team_id, person_id, distinct_id, version)
                VALUES (%s, %s, %s, 0)
                """,
                (self.team_id, person_id, did),
            )
        return person_id

    def create_group(
        self,
        group_type: str,
        group_type_index: int,
        group_key: str,
        group_properties: dict[str, Any],
    ) -> None:
        cur = self.main_conn.cursor()
        cur.execute(
            """
            INSERT INTO posthog_grouptypemapping (team_id, project_id, group_type, group_type_index)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (self.team_id, self.team_id, group_type, group_type_index),
        )
        cur.execute(
            """
            INSERT INTO posthog_group (team_id, group_key, group_type_index,
                                       group_properties, created_at,
                                       properties_last_updated_at, properties_last_operation, version)
            VALUES (%s, %s, %s, %s, now(), '{}', '{}', 0)
            """,
            (self.team_id, group_key, group_type_index, json.dumps(group_properties)),
        )

    def add_to_static_cohort(self, person_id: int, cohort_id: int, version: int = 0) -> None:
        cur = self.persons_conn.cursor()
        cur.execute(
            """
            INSERT INTO posthog_cohortpeople (person_id, cohort_id, version)
            VALUES (%s, %s, %s)
            """,
            (person_id, cohort_id, version),
        )

    def cleanup(self) -> None:
        for conn, tables in [
            (self.persons_conn, ["posthog_cohortpeople", "posthog_persondistinctid", "posthog_person"]),
            (self.main_conn, ["posthog_group", "posthog_grouptypemapping"]),
        ]:
            cur = conn.cursor()
            for table in tables:
                cur.execute(f"DELETE FROM {table} WHERE team_id = %s", (self.team_id,))  # noqa: S608


@pytest.fixture()
def db(env: TestEnv) -> Generator[TestDB, None, None]:
    persons_conn = psycopg2.connect(PERSONS_DATABASE_URL)
    persons_conn.autocommit = True
    main_conn = psycopg2.connect(DATABASE_URL)
    main_conn.autocommit = True
    test_db = TestDB(persons_conn=persons_conn, main_conn=main_conn, team_id=env.team_id)
    yield test_db
    test_db.cleanup()
    persons_conn.close()
    main_conn.close()


# ---------------------------------------------------------------------------
# Django API helpers
# ---------------------------------------------------------------------------


@dataclass
class DjangoAPI:
    """HTTP client for creating cohorts and flags via the Django API."""

    session: requests.Session
    base_url: str
    team_id: int

    def create_cohort(self, name: str, filters: dict[str, Any], is_static: bool = False) -> dict[str, Any]:
        data: dict[str, Any] = {"name": name, "filters": json.dumps(filters)}
        if is_static:
            data["is_static"] = "true"
        resp = self.session.post(
            f"{self.base_url}/api/projects/{self.team_id}/cohorts/",
            data=data,
        )
        assert resp.status_code == 201, f"Failed to create cohort: {resp.text}"
        return resp.json()

    def create_flag(
        self,
        key: str,
        filters: dict[str, Any],
        active: bool = True,
    ) -> dict[str, Any]:
        resp = self.session.post(
            f"{self.base_url}/api/projects/{self.team_id}/feature_flags/",
            json={"key": key, "name": key, "filters": filters, "active": active},
        )
        assert resp.status_code == 201, f"Failed to create flag: {resp.text}"
        return resp.json()

    def cleanup(self) -> None:
        """Delete all flags and cohorts for this team."""
        for resource in ["feature_flags", "cohorts"]:
            resp = self.session.get(f"{self.base_url}/api/projects/{self.team_id}/{resource}/")
            if resp.status_code == 200:
                for item in resp.json().get("results", []):
                    self.session.delete(f"{self.base_url}/api/projects/{self.team_id}/{resource}/{item['id']}/")


@pytest.fixture()
def api(api_session: requests.Session, env: TestEnv) -> Generator[DjangoAPI, None, None]:
    client = DjangoAPI(session=api_session, base_url=DJANGO_API_URL, team_id=env.team_id)
    yield client
    client.cleanup()


# ---------------------------------------------------------------------------
# Rust /flags helper
# ---------------------------------------------------------------------------


def evaluate_flags(
    api_token: str,
    distinct_id: str,
    groups: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Call the Rust /flags endpoint."""
    payload: dict[str, Any] = {"token": api_token, "distinct_id": distinct_id}
    if groups:
        payload["groups"] = groups
    resp = requests.post(f"{RUST_FLAGS_URL}/flags", params={"v": "2"}, json=payload, timeout=10)
    resp.raise_for_status()
    return resp.json()
