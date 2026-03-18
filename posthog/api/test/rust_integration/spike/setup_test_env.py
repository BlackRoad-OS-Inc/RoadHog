"""
One-time setup script for Rust /flags integration tests.

Run via: python posthog/api/test/rust_integration/spike/setup_test_env.py

Creates an organization, project, team, user, and personal API key in the
database. Writes the resulting IDs and keys to a JSON file that tests read.

This script imports Django ORM but is NOT part of the test suite. It runs
as a CI step before tests start, against an already-migrated database.
"""

import os
import sys
import json
import uuid
import hashlib


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "posthog.settings")

    import django  # noqa: E402

    django.setup()

    from posthog.models import Organization, Project, Team, User  # noqa: E402
    from posthog.models.personal_api_key import PersonalAPIKey  # noqa: E402

    output_file = os.environ.get("TEST_ENV_FILE", "/tmp/rust_integration_test_env.json")

    org = Organization.objects.create(name="Rust Integration Test")
    project = Project.objects.create(id=Team.objects.increment_id_sequence(), organization=org)
    team = Team.objects.create(
        id=project.id,
        project=project,
        organization=org,
        api_token=f"phc_test_{uuid.uuid4().hex}",
    )
    user = User.objects.create_and_join(org, "rust-integration@test.posthog.com", "testpassword12345")

    key_value = f"phx_test_{uuid.uuid4().hex}"
    secure_value = f"sha256${hashlib.sha256(key_value.encode()).hexdigest()}"
    PersonalAPIKey.objects.create(
        user=user,
        label="rust-integration-test",
        secure_value=secure_value,
    )

    env = {
        "team_id": team.id,
        "project_id": project.id,
        "api_token": team.api_token,
        "personal_api_key": key_value,
    }

    with open(output_file, "w") as f:
        json.dump(env, f)

    sys.stderr.write(f"Test environment created: team_id={team.id}\n")
    sys.stderr.write(f"Written to {output_file}\n")


if __name__ == "__main__":
    main()
