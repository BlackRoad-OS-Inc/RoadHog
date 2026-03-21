"""
Targeted invalidation for the per-token auth cache.

Sync functions are called by Django signal handlers to invalidate cache
entries immediately. Each has an async Celery task counterpart used as
a retry fallback if the synchronous attempt fails.

No-op stubs for removed warming tasks are kept to avoid ImportError
for tasks already enqueued in Celery. Safe to delete once all in-flight
messages have expired.
"""

from collections.abc import Callable
from typing import Any

import structlog
from celery import Task, shared_task

from posthog.exceptions_capture import capture_exception
from posthog.storage.team_access_cache import token_auth_cache

logger = structlog.get_logger(__name__)


# --- Sync-with-async-fallback helper ---


def _sync_with_async_fallback(
    action: Callable[[], None],
    fallback_task: Task,
    fallback_args: list[Any],
    result_context: dict,
) -> dict:
    """Run a cache invalidation synchronously, falling back to an async Celery retry on failure.

    All token invalidation is security-sensitive: a revoked token must stop
    working immediately, not after Celery queue delay. If the sync attempt
    fails (e.g., brief Redis blip), we schedule an async retry as a safety net.
    """
    try:
        action()
        return {"status": "success", **result_context}
    except Exception as e:
        capture_exception(e)
        logger.exception("Sync invalidation failed, scheduling async retry", **result_context)
        try:
            fallback_task.apply_async(args=fallback_args, countdown=5)
        except Exception as retry_exc:
            capture_exception(retry_exc)
            logger.exception("Failed to schedule async retry", **result_context)
        return {"status": "failure", **result_context}


# --- Celery tasks (used as async retry fallback) ---


@shared_task(bind=True, max_retries=3)
def invalidate_secret_token_cache_task(self: Task, token_hash: str) -> dict:
    """Invalidate a single token's cache entry.

    Used as the async retry fallback for invalidate_token_sync.
    """
    try:
        token_auth_cache.invalidate_token(token_hash)
        return {"status": "success", "token_prefix": token_hash[:12]}
    except Exception as e:
        logger.exception("Failed to invalidate token cache", token_prefix=token_hash[:12])
        raise self.retry(exc=e)


@shared_task(bind=True, max_retries=3)
def invalidate_user_tokens_task(self: Task, user_id: int) -> dict:
    """Invalidate all cached tokens for a user.

    Used as the async retry fallback for invalidate_user_tokens_sync.
    """
    try:
        token_auth_cache.invalidate_user_tokens(user_id)
        return {"status": "success", "user_id": user_id}
    except Exception as e:
        logger.exception("Failed to invalidate user tokens", user_id=user_id)
        raise self.retry(exc=e)


# --- Synchronous invalidation (called by signal handlers) ---


def invalidate_token_sync(token_hash: str) -> dict:
    """Synchronously invalidate a single token's cache entry with async retry fallback.

    Used for secret tokens, personal API keys, and project secret API keys —
    all are cached under their SHA256 hash in the same Redis key namespace.
    """
    return _sync_with_async_fallback(
        action=lambda: token_auth_cache.invalidate_token(token_hash),
        fallback_task=invalidate_secret_token_cache_task,
        fallback_args=[token_hash],
        result_context={"token_prefix": token_hash[:12]},
    )


def invalidate_user_tokens_sync(user_id: int) -> dict:
    """Synchronously invalidate all cached tokens for a user with async retry fallback."""
    return _sync_with_async_fallback(
        action=lambda: token_auth_cache.invalidate_user_tokens(user_id),
        fallback_task=invalidate_user_tokens_task,
        fallback_args=[user_id],
        result_context={"user_id": user_id},
    )


# --- No-op stubs for removed tasks ---
# Kept to avoid ImportError for tasks already enqueued in Celery.
# Safe to delete once all in-flight messages have expired.


@shared_task(ignore_result=True)
def invalidate_personal_api_key_cache_task(secure_value: str) -> None:
    pass


@shared_task(ignore_result=True)
def warm_user_teams_cache_task(user_id: int) -> None:
    pass


@shared_task(ignore_result=True)
def warm_personal_api_key_teams_cache_task(user_id: int) -> None:
    pass


@shared_task(ignore_result=True)
def warm_personal_api_key_deleted_cache_task(user_id: int, scoped_team_ids: list[int] | None) -> None:
    pass


@shared_task(ignore_result=True)
def warm_organization_teams_cache_task(organization_id: str, user_id: int, action: str) -> None:
    pass


@shared_task(ignore_result=True)
def warm_team_cache_task(project_token: str) -> None:
    pass


@shared_task(ignore_result=True)
def warm_all_team_access_caches_task() -> None:
    pass
