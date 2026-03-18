"""
Conftest for Rust integration tests.

Overrides the default django_db_setup to skip ClickHouse initialization,
since these tests only need Postgres and Redis (no ClickHouse).
"""

import pytest

from django.conf import settings
from django.core.management.commands.flush import Command as FlushCommand
from django.db import connections

from posthog.conftest import run_persons_sqlx_migrations


@pytest.fixture(scope="package")
def django_db_setup(django_db_setup, django_db_keepdb, django_db_blocker):
    """
    Override the posthog-level django_db_setup to skip ClickHouse initialization.

    These integration tests only need Postgres and Redis. ClickHouse is not
    available in the CI environment for these tests, and isn't needed since
    we're testing the Rust /flags endpoint against Django-serialized Postgres data.
    """
    from django.db import connection

    test_db_name = connection.settings_dict["NAME"]
    test_persons_db_name = test_db_name + "_persons"

    settings.DATABASES["persons_db_writer"]["NAME"] = test_persons_db_name
    settings.DATABASES["persons_db_reader"]["NAME"] = test_persons_db_name

    with django_db_blocker.unblock():
        with connection.cursor() as cursor:
            cursor.execute("""
                DO $$
                DECLARE r RECORD;
                BEGIN
                    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'posthog_person') THEN
                        FOR r IN
                            SELECT conname, conrelid::regclass AS table_name
                            FROM pg_constraint
                            WHERE contype = 'f'
                            AND confrelid = 'posthog_person'::regclass
                        LOOP
                            EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.table_name, r.conname);
                        END LOOP;
                    END IF;
                END $$;
            """)

            cursor.execute("""
                DROP TABLE IF EXISTS posthog_cohortpeople CASCADE;
                DROP TABLE IF EXISTS posthog_featureflaghashkeyoverride CASCADE;
                DROP TABLE IF EXISTS posthog_group CASCADE;
                DROP TABLE IF EXISTS posthog_grouptypemapping CASCADE;
                DROP TABLE IF EXISTS posthog_persondistinctid CASCADE;
                DROP TABLE IF EXISTS posthog_personlessdistinctid CASCADE;
                DROP TABLE IF EXISTS posthog_personoverride CASCADE;
                DROP TABLE IF EXISTS posthog_pendingpersonoverride CASCADE;
                DROP TABLE IF EXISTS posthog_flatpersonoverride CASCADE;
                DROP TABLE IF EXISTS posthog_personoverridemapping CASCADE;
                DROP TABLE IF EXISTS posthog_person CASCADE;
            """)

    run_persons_sqlx_migrations(keepdb=django_db_keepdb)

    yield


@pytest.fixture(autouse=True)
def patch_flush_command_for_persons_db(monkeypatch):
    """
    Patch Django's flush command to handle persons database properly.

    Copied from posthog/conftest.py — needed here because the package-scoped
    django_db_setup override means we need the same flush handling.
    """
    original_handle = FlushCommand.handle

    def patched_handle(self, **options):
        database = options.get("database")

        if database in ("persons_db_writer", "persons_db_reader"):
            conn = connections[database]
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT tablename FROM pg_tables
                    WHERE schemaname = 'public'
                    AND tablename NOT LIKE 'pg_%'
                    AND tablename NOT LIKE '_sqlx_%'
                    AND tablename NOT LIKE '_persons_migrations'
                """)
                tables = [row[0] for row in cursor.fetchall()]
                if tables:
                    cursor.execute(f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE")
        else:
            return original_handle(self, **options)

    monkeypatch.setattr(FlushCommand, "handle", patched_handle)
