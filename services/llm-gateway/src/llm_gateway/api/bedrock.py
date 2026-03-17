import json
import time
from typing import Any

import boto3
import litellm
import structlog
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from llm_gateway.api.handler import BEDROCK_CONFIG, handle_llm_request
from llm_gateway.config import get_settings
from llm_gateway.dependencies import RateLimitedUser
from llm_gateway.metrics.prometheus import REQUEST_COUNT, REQUEST_LATENCY
from llm_gateway.models.anthropic import AnthropicCountTokensRequest, AnthropicMessagesRequest
from llm_gateway.products.config import validate_product
from llm_gateway.request_context import apply_posthog_context_from_headers

logger = structlog.get_logger(__name__)

bedrock_router = APIRouter()

COUNT_TOKENS_ENDPOINT_NAME = "bedrock_count_tokens"

# Fields that the Bedrock Claude invoke API accepts (via litellm.anthropic_messages)
_BEDROCK_ALLOWED_BODY_FIELDS = frozenset(
    {
        "model",  # required by litellm for routing (stripped by Bedrock transform)
        "messages",  # required
        "max_tokens",  # required
        "stream",  # used by litellm (stripped by Bedrock transform)
        "system",
        "stop_sequences",
        "temperature",
        "top_p",
        "top_k",
        "tools",
        "tool_choice",
        "thinking",
        "metadata",
        "cache_control",
        "output_config",  # stripped by Bedrock transform
        "output_format",  # converted by Bedrock transform
    }
)


def ensure_bedrock_configured(settings: Any) -> None:
    logger.info(f"inside ensure_bedrock_configured: {settings.bedrock_region_name}")
    if settings.bedrock_region_name:
        return

    logger.warning("Bedrock region not configured")
    raise HTTPException(
        status_code=503,
        detail={"error": {"message": "Bedrock region not configured", "type": "configuration_error"}},
    )


def count_tokens_with_bedrock(
    messages: list[dict[str, Any]], model: str, aws_region_name: str, max_tokens: int = 4096
) -> int:
    bedrock_runtime_client = boto3.client("bedrock-runtime", region_name=aws_region_name)

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "messages": messages,
    }
    # The CountTokens API doesn't accept regional model prefixes
    model = model.replace("us.anthropic.", "anthropic.").replace("eu.anthropic.", "anthropic.")

    response = bedrock_runtime_client.count_tokens(
        modelId=model,
        input={"invokeModel": {"body": json.dumps(body).encode("utf-8")}},
    )
    return int(response["inputTokens"])


# Implemented as a proxy for Anthropic models right now
async def _handle_bedrock_messages(
    body: AnthropicMessagesRequest,
    user: RateLimitedUser,
    request: Request,
    product: str = "llm_gateway",
) -> dict[str, Any] | StreamingResponse:
    settings = get_settings()
    settings.bedrock_region_name = "us-east-1"  # @TODO: make real
    ensure_bedrock_configured(settings)

    raw_data = body.model_dump(exclude_none=True)

    dropped_keys = set(raw_data.keys()) - _BEDROCK_ALLOWED_BODY_FIELDS
    if dropped_keys:
        logger.warning("bedrock_dropped_fields", dropped_keys=sorted(dropped_keys))
    data = {k: v for k, v in raw_data.items() if k in _BEDROCK_ALLOWED_BODY_FIELDS}

    anthropic_beta = request.headers.get("anthropic-beta")
    if anthropic_beta:
        data["anthropic_beta"] = [h.strip() for h in anthropic_beta.split(",") if h.strip()]

    return await handle_llm_request(
        request_data=data,
        user=user,
        model=data["model"],
        is_streaming=body.stream or False,
        provider_config=BEDROCK_CONFIG,
        llm_call=litellm.anthropic_messages,
        product=product,
    )


async def _handle_count_tokens(
    body: AnthropicCountTokensRequest,
    user: RateLimitedUser,
    product: str = "llm_gateway",
) -> dict[str, Any]:
    settings = get_settings()
    ensure_bedrock_configured(settings)

    start_time = time.monotonic()
    status_code = "200"
    data = body.model_dump(exclude_none=True)

    try:
        input_tokens = count_tokens_with_bedrock(
            data["messages"], body.model, settings.bedrock_region_name, max_tokens=data.get("max_tokens", 4096)
        )
        return {"input_tokens": input_tokens}
    except HTTPException as e:
        status_code = str(e.status_code)
        raise
    except Exception as e:
        status_code = "502"
        logger.info({"model": body.model, "max_tokens": data.get("max_tokens", 4096)})
        logger.exception(f"Error proxying bedrock count_tokens request: {e}")
        raise HTTPException(
            status_code=502,
            detail={"error": {"message": "Failed to count tokens via Bedrock", "type": "proxy_error"}},
        ) from e
    finally:
        REQUEST_COUNT.labels(
            endpoint=COUNT_TOKENS_ENDPOINT_NAME,
            provider="bedrock",
            model=body.model,
            status_code=status_code,
            auth_method=user.auth_method,
            product=product,
        ).inc()
        REQUEST_LATENCY.labels(
            endpoint=COUNT_TOKENS_ENDPOINT_NAME,
            provider="bedrock",
            streaming="false",
            product=product,
        ).observe(time.monotonic() - start_time)


@bedrock_router.post("/bedrock/v1/messages/count_tokens", response_model=None)
async def bedrock_count_tokens(
    body: AnthropicCountTokensRequest,
    user: RateLimitedUser,
) -> dict[str, Any]:
    return await _handle_count_tokens(body, user)


@bedrock_router.post("/{product}/bedrock/v1/messages/count_tokens", response_model=None)
async def bedrock_count_tokens_with_product(
    body: AnthropicCountTokensRequest,
    user: RateLimitedUser,
    product: str,
) -> dict[str, Any]:
    validate_product(product)
    return await _handle_count_tokens(body, user, product=product)


@bedrock_router.post("/bedrock/v1/messages", response_model=None)
async def bedrock_messages(
    body: AnthropicMessagesRequest,
    user: RateLimitedUser,
    request: Request,
) -> dict[str, Any] | StreamingResponse:
    apply_posthog_context_from_headers(request)
    return await _handle_bedrock_messages(body, user, request)


@bedrock_router.post("/{product}/bedrock/v1/messages", response_model=None)
async def bedrock_messages_with_product(
    body: AnthropicMessagesRequest,
    user: RateLimitedUser,
    product: str,
    request: Request,
) -> dict[str, Any] | StreamingResponse:
    validate_product(product)
    apply_posthog_context_from_headers(request)

    return await _handle_bedrock_messages(body, user, request, product=product)
