import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


class TestBedrockMessagesEndpoint:
    @pytest.fixture
    def mock_anthropic_response(self) -> dict[str, Any]:
        return {
            "id": "msg_123",
            "type": "message",
            "role": "assistant",
            "content": [{"type": "text", "text": "Hello!"}],
            "model": "us.anthropic.claude-sonnet-4-6",
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 10, "output_tokens": 5},
        }

    @patch("llm_gateway.api.bedrock.handle_llm_request", new_callable=AsyncMock)
    @patch("llm_gateway.api.bedrock.get_settings")
    def test_passes_model_through_to_handler(
        self,
        mock_get_settings: MagicMock,
        mock_handle: AsyncMock,
        authenticated_client: TestClient,
        mock_anthropic_response: dict,
    ) -> None:
        mock_get_settings.return_value = MagicMock()
        mock_handle.return_value = mock_anthropic_response

        response = authenticated_client.post(
            "/bedrock/v1/messages",
            json={"model": "us.anthropic.claude-sonnet-4-6", "messages": [{"role": "user", "content": "Hello"}]},
            headers={"Authorization": "Bearer phx_test_key"},
        )

        assert response.status_code == 200
        call_kwargs = mock_handle.call_args.kwargs
        assert call_kwargs["model"] == "us.anthropic.claude-sonnet-4-6"

    @patch("llm_gateway.api.bedrock.handle_llm_request", new_callable=AsyncMock)
    @patch("llm_gateway.api.bedrock.get_settings")
    def test_product_route_supported(
        self,
        mock_get_settings: MagicMock,
        mock_handle: AsyncMock,
        authenticated_client: TestClient,
        mock_anthropic_response: dict,
    ) -> None:
        mock_get_settings.return_value = MagicMock()
        mock_handle.return_value = mock_anthropic_response

        response = authenticated_client.post(
            "/wizard/bedrock/v1/messages",
            json={"model": "us.anthropic.claude-sonnet-4-6", "messages": [{"role": "user", "content": "Hello"}]},
            headers={"Authorization": "Bearer phx_test_key"},
        )
        assert response.status_code == 200

    @patch("llm_gateway.api.bedrock.handle_llm_request", new_callable=AsyncMock)
    @patch("llm_gateway.api.bedrock.get_settings")
    def test_filters_to_allowed_fields_only(
        self,
        mock_get_settings: MagicMock,
        mock_handle: AsyncMock,
        authenticated_client: TestClient,
        mock_anthropic_response: dict,
    ) -> None:
        mock_get_settings.return_value = MagicMock()
        mock_handle.return_value = mock_anthropic_response

        body = {
            "model": "us.anthropic.claude-sonnet-4-6",
            "messages": [{"role": "user", "content": "Hello"}],
            "tools": [
                {
                    "name": "get_weather",
                    "description": "Get weather by city",
                    "input_schema": {"type": "object", "properties": {"city": {"type": "string"}}},
                }
            ],
            "unknown_field": "should_be_dropped",
        }
        response = authenticated_client.post(
            "/bedrock/v1/messages",
            json=body,
            headers={"Authorization": "Bearer phx_test_key"},
        )

        assert response.status_code == 200
        request_data = mock_handle.call_args.kwargs["request_data"]
        assert request_data["tools"] == body["tools"]
        assert "unknown_field" not in request_data

    @patch("llm_gateway.api.bedrock.handle_llm_request", new_callable=AsyncMock)
    @patch("llm_gateway.api.bedrock.get_settings")
    def test_anthropic_beta_header_parsed_to_list(
        self,
        mock_get_settings: MagicMock,
        mock_handle: AsyncMock,
        authenticated_client: TestClient,
        mock_anthropic_response: dict,
    ) -> None:
        mock_get_settings.return_value = MagicMock()
        mock_handle.return_value = mock_anthropic_response

        response = authenticated_client.post(
            "/bedrock/v1/messages",
            json={"model": "us.anthropic.claude-sonnet-4-6", "messages": [{"role": "user", "content": "Hello"}]},
            headers={
                "Authorization": "Bearer phx_test_key",
                "anthropic-beta": "interleaved-thinking-2025-05-14, extended-thinking-2025-05-14",
            },
        )

        assert response.status_code == 200
        request_data = mock_handle.call_args.kwargs["request_data"]
        assert request_data["anthropic_beta"] == [
            "interleaved-thinking-2025-05-14",
            "extended-thinking-2025-05-14",
        ]

    @patch("llm_gateway.api.bedrock.handle_llm_request", new_callable=AsyncMock)
    @patch("llm_gateway.api.bedrock.get_settings")
    def test_no_anthropic_beta_when_header_absent(
        self,
        mock_get_settings: MagicMock,
        mock_handle: AsyncMock,
        authenticated_client: TestClient,
        mock_anthropic_response: dict,
    ) -> None:
        mock_get_settings.return_value = MagicMock()
        mock_handle.return_value = mock_anthropic_response

        response = authenticated_client.post(
            "/bedrock/v1/messages",
            json={"model": "us.anthropic.claude-sonnet-4-6", "messages": [{"role": "user", "content": "Hello"}]},
            headers={"Authorization": "Bearer phx_test_key"},
        )

        assert response.status_code == 200
        request_data = mock_handle.call_args.kwargs["request_data"]
        assert "anthropic_beta" not in request_data

    @patch("llm_gateway.api.bedrock.handle_llm_request", new_callable=AsyncMock)
    @patch("llm_gateway.api.bedrock.get_settings")
    def test_uses_bedrock_provider_config(
        self,
        mock_get_settings: MagicMock,
        mock_handle: AsyncMock,
        authenticated_client: TestClient,
        mock_anthropic_response: dict,
    ) -> None:
        mock_get_settings.return_value = MagicMock()
        mock_handle.return_value = mock_anthropic_response

        authenticated_client.post(
            "/bedrock/v1/messages",
            json={"model": "us.anthropic.claude-sonnet-4-6", "messages": [{"role": "user", "content": "Hello"}]},
            headers={"Authorization": "Bearer phx_test_key"},
        )

        from llm_gateway.api.handler import BEDROCK_CONFIG

        call_kwargs = mock_handle.call_args.kwargs
        assert call_kwargs["provider_config"] is BEDROCK_CONFIG


class TestBedrockCountTokensEndpoint:
    @pytest.fixture
    def valid_request_body(self) -> dict[str, Any]:
        return {
            "model": "us.anthropic.claude-sonnet-4-6",
            "messages": [{"role": "user", "content": "Hello"}],
        }

    @patch("llm_gateway.api.bedrock.get_settings")
    @patch("llm_gateway.api.bedrock.boto3.client")
    def test_calls_bedrock_count_tokens_api(
        self,
        mock_boto3_client: MagicMock,
        mock_get_settings: MagicMock,
        authenticated_client: TestClient,
        valid_request_body: dict,
    ) -> None:
        mock_settings = MagicMock()
        mock_settings.bedrock_region_name = "us-east-1"
        mock_get_settings.return_value = mock_settings

        mock_bedrock = MagicMock()
        mock_bedrock.count_tokens.return_value = {"inputTokens": 42}
        mock_boto3_client.return_value = mock_bedrock

        response = authenticated_client.post(
            "/bedrock/v1/messages/count_tokens",
            json=valid_request_body,
            headers={"Authorization": "Bearer phx_test_key"},
        )

        assert response.status_code == 200
        assert response.json()["input_tokens"] == 42
        mock_boto3_client.assert_called_once_with("bedrock-runtime", region_name="us-east-1")

    @pytest.mark.parametrize(
        "model,expected_model_id",
        [
            pytest.param("us.anthropic.claude-sonnet-4-6", "anthropic.claude-sonnet-4-6", id="us_prefix"),
            pytest.param("eu.anthropic.claude-sonnet-4-6", "anthropic.claude-sonnet-4-6", id="eu_prefix"),
            pytest.param("anthropic.claude-sonnet-4-6", "anthropic.claude-sonnet-4-6", id="no_prefix"),
        ],
    )
    @patch("llm_gateway.api.bedrock.get_settings")
    @patch("llm_gateway.api.bedrock.boto3.client")
    def test_strips_regional_prefix_from_model_id(
        self,
        mock_boto3_client: MagicMock,
        mock_get_settings: MagicMock,
        authenticated_client: TestClient,
        model: str,
        expected_model_id: str,
    ) -> None:
        mock_settings = MagicMock()
        mock_settings.bedrock_region_name = "us-east-1"
        mock_get_settings.return_value = mock_settings

        mock_bedrock = MagicMock()
        mock_bedrock.count_tokens.return_value = {"inputTokens": 10}
        mock_boto3_client.return_value = mock_bedrock

        authenticated_client.post(
            "/bedrock/v1/messages/count_tokens",
            json={"model": model, "messages": [{"role": "user", "content": "Hello"}]},
            headers={"Authorization": "Bearer phx_test_key"},
        )

        call_kwargs = mock_bedrock.count_tokens.call_args.kwargs
        assert call_kwargs["modelId"] == expected_model_id

    @patch("llm_gateway.api.bedrock.get_settings")
    @patch("llm_gateway.api.bedrock.boto3.client")
    def test_passes_custom_max_tokens(
        self,
        mock_boto3_client: MagicMock,
        mock_get_settings: MagicMock,
        authenticated_client: TestClient,
    ) -> None:
        mock_settings = MagicMock()
        mock_settings.bedrock_region_name = "us-east-1"
        mock_get_settings.return_value = mock_settings

        mock_bedrock = MagicMock()
        mock_bedrock.count_tokens.return_value = {"inputTokens": 42}
        mock_boto3_client.return_value = mock_bedrock

        authenticated_client.post(
            "/bedrock/v1/messages/count_tokens",
            json={
                "model": "us.anthropic.claude-sonnet-4-6",
                "messages": [{"role": "user", "content": "Hello"}],
                "max_tokens": 8192,
            },
            headers={"Authorization": "Bearer phx_test_key"},
        )

        call_kwargs = mock_bedrock.count_tokens.call_args.kwargs
        body = json.loads(call_kwargs["input"]["invokeModel"]["body"])
        assert body["max_tokens"] == 8192

    @patch("llm_gateway.api.bedrock.get_settings")
    @patch("llm_gateway.api.bedrock.boto3.client")
    def test_defaults_max_tokens_to_4096(
        self,
        mock_boto3_client: MagicMock,
        mock_get_settings: MagicMock,
        authenticated_client: TestClient,
    ) -> None:
        mock_settings = MagicMock()
        mock_settings.bedrock_region_name = "us-east-1"
        mock_get_settings.return_value = mock_settings

        mock_bedrock = MagicMock()
        mock_bedrock.count_tokens.return_value = {"inputTokens": 42}
        mock_boto3_client.return_value = mock_bedrock

        authenticated_client.post(
            "/bedrock/v1/messages/count_tokens",
            json={
                "model": "us.anthropic.claude-sonnet-4-6",
                "messages": [{"role": "user", "content": "Hello"}],
            },
            headers={"Authorization": "Bearer phx_test_key"},
        )

        call_kwargs = mock_bedrock.count_tokens.call_args.kwargs
        body = json.loads(call_kwargs["input"]["invokeModel"]["body"])
        assert body["max_tokens"] == 4096

    @patch("llm_gateway.api.bedrock.get_settings")
    def test_requires_bedrock_region(
        self,
        mock_get_settings: MagicMock,
        authenticated_client: TestClient,
        valid_request_body: dict,
    ) -> None:
        mock_settings = MagicMock()
        mock_settings.bedrock_region_name = None
        mock_get_settings.return_value = mock_settings

        response = authenticated_client.post(
            "/bedrock/v1/messages/count_tokens",
            json=valid_request_body,
            headers={"Authorization": "Bearer phx_test_key"},
        )

        assert response.status_code == 503
        assert "Bedrock region not configured" in response.json()["error"]["message"]

    @patch("llm_gateway.api.bedrock.get_settings")
    @patch("llm_gateway.api.bedrock.boto3.client")
    def test_returns_502_on_boto3_error(
        self,
        mock_boto3_client: MagicMock,
        mock_get_settings: MagicMock,
        authenticated_client: TestClient,
        valid_request_body: dict,
    ) -> None:
        mock_settings = MagicMock()
        mock_settings.bedrock_region_name = "us-east-1"
        mock_get_settings.return_value = mock_settings

        mock_bedrock = MagicMock()
        mock_bedrock.count_tokens.side_effect = Exception("AWS error")
        mock_boto3_client.return_value = mock_bedrock

        response = authenticated_client.post(
            "/bedrock/v1/messages/count_tokens",
            json=valid_request_body,
            headers={"Authorization": "Bearer phx_test_key"},
        )

        assert response.status_code == 502
        assert "Failed to count tokens via Bedrock" in response.json()["error"]["message"]

    @patch("llm_gateway.api.bedrock.get_settings")
    @patch("llm_gateway.api.bedrock.boto3.client")
    def test_product_route_supported(
        self,
        mock_boto3_client: MagicMock,
        mock_get_settings: MagicMock,
        authenticated_client: TestClient,
        valid_request_body: dict,
    ) -> None:
        mock_settings = MagicMock()
        mock_settings.bedrock_region_name = "us-east-1"
        mock_get_settings.return_value = mock_settings

        mock_bedrock = MagicMock()
        mock_bedrock.count_tokens.return_value = {"inputTokens": 42}
        mock_boto3_client.return_value = mock_bedrock

        response = authenticated_client.post(
            "/wizard/bedrock/v1/messages/count_tokens",
            json=valid_request_body,
            headers={"Authorization": "Bearer phx_test_key"},
        )

        assert response.status_code == 200
        assert response.json()["input_tokens"] == 42
