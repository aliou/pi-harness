# Providers

Providers add LLM backends to pi. They connect pi to model APIs (OpenAI-compatible or custom).

## Registration

```typescript
import { Type, type ExtensionAPI, type ProviderDefinition } from "@mariozechner/pi-coding-agent";

const myProvider: ProviderDefinition = {
  name: "my-provider",
  models: () => {
    const apiKey = process.env.MY_API_KEY;
    if (!apiKey) return [];

    return [
      {
        id: "my-provider/model-name",
        name: "Model Name",
        provider: "my-provider",
        canStream: true,
        contextLength: 128000,
        maxOutputTokens: 8192,
        pricing: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
        compat: {
          type: "openai-completions",
          maxTokensField: "max_tokens",
          supportsDeveloperRole: false,
        },
      },
    ];
  },
  apiKey: () => process.env.MY_API_KEY,
  baseUrl: () => "https://api.my-provider.com/v1",
};

export default function (pi: ExtensionAPI) {
  pi.registerProvider(myProvider);
}
```

## Provider Definition

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Unique provider identifier. Used as prefix in model IDs. |
| `models` | `() => ProviderModelConfig[]` | Returns available models. Called when pi needs the model list. Return `[]` if the API key is missing. |
| `apiKey` | `() => string \| undefined` | Returns the API key. Pi calls this when making requests. |
| `baseUrl` | `() => string \| undefined` | Returns the base URL for the API. |

The `models` function is the right place to check for API key presence. If the key is missing, return an empty array and the provider will appear registered but offer no models.

## Model Definition

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique model ID. Convention: `provider/model-name`. |
| `name` | `string` | Display name shown in model picker. |
| `provider` | `string` | Must match the provider's `name`. |
| `canStream` | `boolean` | Whether the model supports streaming responses. |
| `contextLength` | `number` | Maximum context window in tokens. |
| `maxOutputTokens` | `number` | Maximum output tokens per response. |
| `pricing` | `object` | `{ inputPerMillion, outputPerMillion }` in USD. Used for cost display. |
| `compat` | `object` | OpenAI compatibility settings. See below. |

## Compat Field

The `compat` field tells pi how to talk to the model's API. Most third-party APIs are OpenAI-compatible but differ in which features they support.

```typescript
compat: {
  type: "openai-completions",

  // Which field name the API uses for max output tokens
  maxTokensField: "max_tokens" | "max_completion_tokens",

  // Whether the API supports the 'developer' role (vs 'system')
  supportsDeveloperRole: boolean,

  // Whether the API supports the 'store' parameter
  supportsStore: boolean,

  // Whether the API supports reasoning_effort parameter
  supportsReasoningEffort: boolean,

  // Whether usage stats are included in streaming responses
  supportsUsageInStreaming: boolean,

  // Whether tool results must include a 'name' field
  requiresToolResultName: boolean,

  // Whether an assistant message is required after tool results
  requiresAssistantAfterToolResult: boolean,

  // Whether thinking/reasoning must be sent as text content
  requiresThinkingAsText: boolean,

  // Mistral-specific tool ID requirements
  requiresMistralToolIds: boolean,

  // Format for thinking/reasoning blocks
  thinkingFormat: "openai" | "zai" | "qwen",

  // OpenRouter-specific routing hints
  openRouterRouting: object,

  // Vercel AI Gateway routing
  vercelGatewayRouting: object,
}
```

All fields in `compat` are optional except `type`. Start with the minimum and add fields as needed based on API behavior.

There is also `type: "openai-responses"` for providers using the OpenAI Responses API, which currently has no additional compat fields.

## Provider with API Key Gate

Register the provider unconditionally but gate tools/commands on the API key:

```typescript
export default function (pi: ExtensionAPI) {
  // Provider always registered -- models() returns [] if no key
  pi.registerProvider(myProvider);

  const apiKey = process.env.MY_API_KEY;
  if (!apiKey) return;

  // Only register tools that need the key
  pi.registerTool(createSearchTool(apiKey));
  pi.registerCommand(createQuotasCommand(apiKey));
}
```

This way the provider appears in pi's provider list even without a key, and users see a clear "no models available" state rather than a missing provider.
