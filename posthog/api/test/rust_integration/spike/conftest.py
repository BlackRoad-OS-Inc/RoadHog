"""
Fixtures for standalone Rust /flags integration tests.

No Django test framework. Tests use:
- psycopg2 for person/group inserts (persons database)
- requests for Django API calls (cohorts, flags)
- requests for Rust /flags evaluation

The test environment (team, user, API key) is created by setup_test_env.py
before tests run, and read from a JSON file here.
"""

import os
import json
import uuid
from dataclasses import dataclass
from typing import Any

import pytest

import psycopg2
import requests

DJANGO_API_URL = os.environ.get("DJANGO_API_URL", "http://localhost:8000")
RUST_FLAGS_URL = os.environ.get("FEATURE_FLAGS_SERVICE_URL", "http://localhost:3001")
MAIN_DB_URL = os.environ.get("DATABASE_URL", "postgres://posthog:posthog@localhost:5432/test_posthog")
PERSONS_DB_URL = os.environ.get(
    "PERSONS_DATABASE_URL", "postgres://posthog:posthog@localhost:5432/test_posthog_persons"
)
TEST_ENV_FILE = os.environ.get("TEST_ENV_FILE", "/tmp/rust_integration_test_env.json")

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


@pytest.fixture(scope="session")
def env() -> TestEnv:
    with open(TEST_ENV_FILE) as f:
        data = json.load(f)
    return TestEnv(**data)


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
class PersonsDB:
    """Thin wrapper around psycopg2 for inserting persons-database entities."""

    conn: Any  # psycopg2 connection
    team_id: int

    def create_person(self, distinct_ids: list[str], properties: dict[str, Any]) -> int:
        cur = self.conn.cursor()
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
        cur = self.conn.cursor()
        # Ensure the group type mapping exists
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
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO posthog_cohortpeople (person_id, cohort_id, version)
            VALUES (%s, %s, %s)
            """,
            (person_id, cohort_id, version),
        )

    def cleanup(self) -> None:
        cur = self.conn.cursor()
        for table in [
            "posthog_cohortpeople",
            "posthog_persondistinctid",
            "posthog_person",
            "posthog_group",
            "posthog_grouptypemapping",
        ]:
            cur.execute(f"DELETE FROM {table} WHERE team_id = %s", (self.team_id,))  # noqa: S608


@pytest.fixture()
def persons_db(env: TestEnv) -> PersonsDB:
    conn = psycopg2.connect(PERSONS_DB_URL)
    conn.autocommit = True
    db = PersonsDB(conn=conn, team_id=env.team_id)
    yield db
    db.cleanup()
    conn.close()


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
def api(api_session: requests.Session, env: TestEnv) -> DjangoAPI:
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
