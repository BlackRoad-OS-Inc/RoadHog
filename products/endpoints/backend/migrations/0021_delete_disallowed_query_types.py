from django.db import migrations

import structlog

logger = structlog.get_logger(__name__)

DISALLOWED_QUERY_KINDS = {"FunnelsQuery", "StickinessQuery", "PathsQuery"}


def delete_disallowed_endpoints(apps, _):
    EndpointVersion = apps.get_model("endpoints", "EndpointVersion")
    Endpoint = apps.get_model("endpoints", "Endpoint")

    disallowed_versions = EndpointVersion.objects.filter(query__kind__in=list(DISALLOWED_QUERY_KINDS))

    endpoint_ids = set(disallowed_versions.values_list("endpoint_id", flat=True))

    if not endpoint_ids:
        return

    logger.info(
        "Deleting endpoints with disallowed query types",
        endpoint_count=len(endpoint_ids),
        query_kinds=DISALLOWED_QUERY_KINDS,
    )

    # Delete versions first, then the endpoints themselves
    disallowed_versions.delete()
    # Delete endpoints that no longer have any versions
    Endpoint.objects.filter(id__in=endpoint_ids).exclude(
        id__in=EndpointVersion.objects.values_list("endpoint_id", flat=True)
    ).delete()


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("endpoints", "0020_backfill_endpoint_edges"),
    ]

    operations = [
        migrations.RunPython(delete_disallowed_endpoints, reverse_noop, elidable=True),
    ]
