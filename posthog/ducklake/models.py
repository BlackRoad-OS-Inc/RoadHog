from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import models

from posthog.helpers.encrypted_fields import EncryptedTextField
from posthog.models.utils import CreatedMetaFields, UpdatedMetaFields, UUIDModel

if TYPE_CHECKING:
    from posthog.ducklake.storage import CrossAccountDestination


class DuckLakeCatalog(CreatedMetaFields, UpdatedMetaFields, UUIDModel):
    """Per-team DuckLake catalog configuration.

    Stores database connection details and bucket configuration for teams that need
    isolated DuckLake catalogs (e.g., single-tenant Duckling customers).

    For teams without a DuckLakeCatalog entry, the system falls back to
    environment variable configuration.
    """

    team = models.OneToOneField(
        "posthog.Team",
        on_delete=models.CASCADE,
        related_name="ducklake_catalog",
    )

    # Database connection settings
    db_host = models.CharField(max_length=255)
    db_port = models.IntegerField(default=5432)
    db_database = models.CharField(max_length=255, default="ducklake")
    db_username = models.CharField(max_length=255)
    db_password = EncryptedTextField(max_length=500)

    # Bucket settings (no secrets - credentials come from IRSA or storage.py)
    bucket = models.CharField(max_length=255)
    bucket_region = models.CharField(max_length=50, default="us-east-1")

    # Cross-account S3 access settings (required - for writing to customer-owned buckets)
    cross_account_role_arn = models.CharField(
        max_length=255,
        help_text="ARN of the IAM role to assume for cross-account S3 access",
    )
    cross_account_external_id = EncryptedTextField(
        max_length=500,
        help_text="External ID for cross-account role assumption (encrypted)",
    )

    class Meta:
        db_table = "posthog_ducklakecatalog"
        verbose_name = "DuckLake catalog"
        verbose_name_plural = "DuckLake catalogs"

    def to_public_config(self) -> dict[str, str]:
        """Convert to a config dict without secrets (safe for logging/debugging)."""
        return {
            "DUCKLAKE_RDS_HOST": self.db_host,
            "DUCKLAKE_RDS_PORT": str(self.db_port),
            "DUCKLAKE_RDS_DATABASE": self.db_database,
            "DUCKLAKE_RDS_USERNAME": self.db_username,
            "DUCKLAKE_BUCKET": self.bucket,
            "DUCKLAKE_BUCKET_REGION": self.bucket_region,
            "DUCKLAKE_S3_ACCESS_KEY": "",
            "DUCKLAKE_S3_SECRET_KEY": "",
        }

    def to_cross_account_destination(self) -> CrossAccountDestination:
        """Convert to a CrossAccountDestination for cross-account S3 access."""
        from posthog.ducklake.storage import CrossAccountDestination

        return CrossAccountDestination(
            role_arn=self.cross_account_role_arn,
            bucket_name=self.bucket,
            external_id=self.cross_account_external_id,
            region=self.bucket_region or None,
        )


class DuckgresServer(CreatedMetaFields, UpdatedMetaFields, UUIDModel):
    """Per-team duckgres query server connection details.

    Duckgres is a Postgres-protocol-compatible DuckDB server, separate from
    the DuckLake catalog Postgres database. Each team that uses duckgres for
    copy workflows needs its own connection entry.
    """

    team = models.OneToOneField(
        "posthog.Team",
        on_delete=models.CASCADE,
        related_name="duckgres_server",
    )
    host = models.CharField(max_length=255)
    port = models.IntegerField(default=5432)
    flight_port = models.IntegerField(default=8815)
    database = models.CharField(max_length=255, default="ducklake")
    username = models.CharField(max_length=255)
    password = EncryptedTextField(max_length=500)

    class Meta:
        db_table = "posthog_duckgresserver"
        verbose_name = "Duckgres server"
        verbose_name_plural = "Duckgres servers"


class DucklingBackfillRun(CreatedMetaFields, UpdatedMetaFields, UUIDModel):
    """Tracks the status of duckling backfill runs per team/data_type/partition.

    Each row represents one partition of data (e.g., events for 2024-01-15) being
    backfilled to a customer's duckling. The unique constraint on
    (team, data_type, partition_key) ensures idempotent processing.
    """

    team = models.ForeignKey(
        "posthog.Team",
        on_delete=models.CASCADE,
        related_name="duckling_backfill_runs",
    )
    data_type = models.CharField(max_length=20)  # "events" or "persons"
    partition_key = models.CharField(max_length=50)  # "2024-01-15" or "2024-01"
    status = models.CharField(max_length=20, default="pending")  # pending/running/completed/failed
    workflow_id = models.CharField(max_length=255, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    records_exported = models.IntegerField(default=0)
    bytes_exported = models.BigIntegerField(default=0)

    class Meta:
        db_table = "posthog_ducklingbackfillrun"
        unique_together = [("team", "data_type", "partition_key")]
        verbose_name = "Duckling backfill run"
        verbose_name_plural = "Duckling backfill runs"
        indexes = [
            models.Index(fields=["data_type", "status"], name="idx_ducklingbackfill_type_stat"),
        ]
