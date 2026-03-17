import json

import boto3

client = boto3.client("bedrock-runtime", region_name="us-east-1")
response = client.invoke_model(
    modelId="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    body=json.dumps(
        {
            "messages": [{"role": "user", "content": "Can you explain the features of Amazon Bedrock?"}],
            "max_tokens": 16000,
            "anthropic_version": "bedrock-2023-05-31",
            "thinking": {
                "type": "enabled",
                "budget_tokens": 2000,
            },
        }
    ),
)
result = json.loads(response["body"].read())
print(json.dumps(result, indent=2))
