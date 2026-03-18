# No custom conftest needed — posthog/conftest.py's django_db_setup
# gracefully skips ClickHouse when it's unavailable, which is all
# these tests need (they only require Postgres and Redis).
