"""Mailgun integration helpers for conversations email channel."""

import hmac
import time
import hashlib
from typing import Any

import requests
import structlog

from posthog.models.instance_setting import get_instance_setting

logger = structlog.get_logger(__name__)

MAILGUN_API_BASE = "https://api.mailgun.net/v3"

WEBHOOK_TIMESTAMP_MAX_AGE_SECONDS = 300  # 5 minutes


def validate_webhook_signature(token: str, timestamp: str, signature: str) -> bool:
    """Verify inbound Mailgun webhook authenticity via HMAC-SHA256.

    Also rejects timestamps older than 5 minutes to prevent replay attacks.
    """
    # Uncomment this to allow debugging in development
    # if settings.DEBUG:
    #    return True

    signing_key = get_instance_setting("CONVERSATIONS_EMAIL_WEBHOOK_SIGNING_KEY")
    if not signing_key:
        return False

    # Reject stale timestamps
    try:
        ts = int(timestamp)
    except (ValueError, TypeError):
        return False
    if abs(time.time() - ts) > WEBHOOK_TIMESTAMP_MAX_AGE_SECONDS:
        return False

    expected = hmac.new(
        key=signing_key.encode("utf-8"),
        msg=f"{timestamp}{token}".encode(),
        digestmod=hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


def _get_api_key() -> str:
    key = get_instance_setting("CONVERSATIONS_EMAIL_MAILGUN_API_KEY")
    if not key:
        raise ValueError("CONVERSATIONS_EMAIL_MAILGUN_API_KEY is not configured")
    return key


def add_domain(domain: str) -> dict[str, Any]:
    """Register a sending domain with Mailgun. Returns DNS records to configure."""
    resp = requests.post(
        f"{MAILGUN_API_BASE}/domains",
        auth=("api", _get_api_key()),
        data={"name": domain},
        timeout=15,
    )

    if resp.status_code == 200:
        data = resp.json()
        return {
            "sending_dns_records": data.get("sending_dns_records", []),
            "receiving_dns_records": data.get("receiving_dns_records", []),
        }

    # Mailgun returns 400 when domain already exists — fetch its records instead
    if resp.status_code == 400:
        return get_domain_dns_records(domain)

    resp.raise_for_status()
    return {}


def get_domain_dns_records(domain: str) -> dict[str, Any]:
    """Fetch DNS records for an existing Mailgun domain."""
    resp = requests.get(
        f"{MAILGUN_API_BASE}/domains/{domain}",
        auth=("api", _get_api_key()),
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {
        "sending_dns_records": data.get("sending_dns_records", []),
        "receiving_dns_records": data.get("receiving_dns_records", []),
    }


def verify_domain(domain: str) -> dict[str, Any]:
    """Trigger DNS verification for a domain and return current status."""
    resp = requests.put(
        f"{MAILGUN_API_BASE}/domains/{domain}/verify",
        auth=("api", _get_api_key()),
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    domain_info = data.get("domain", {})
    return {
        "state": domain_info.get("state", "unverified"),
        "sending_dns_records": data.get("sending_dns_records", []),
        "receiving_dns_records": data.get("receiving_dns_records", []),
    }


def delete_domain(domain: str) -> None:
    """Remove a sending domain from Mailgun."""
    resp = requests.delete(
        f"{MAILGUN_API_BASE}/domains/{domain}",
        auth=("api", _get_api_key()),
        timeout=15,
    )
    if resp.status_code == 404:
        logger.info("mailgun_domain_not_found_on_delete", domain=domain)
        return
    resp.raise_for_status()
