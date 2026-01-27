# Custom Providers

Pi supports registering custom AI providers that can be used alongside built-in providers.

## Directory Layout

```
extensions/<name>/
├── providers/
│   ├── index.ts       # Hub: exports setup function
│   └── <provider>.ts  # Individual provider definitions
```

## Provider Hub

```typescript
// extensions/<name>/providers/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerFooProvider } from "./foo";
import { registerBarProvider } from "./bar";

export function registerAllProviders(pi: ExtensionAPI): void {
  registerFooProvider(pi);
  registerBarProvider(pi);
}
```

## Provider Definition

```typescript
// extensions/<name>/providers/<provider>.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export function registerFooProvider(pi: ExtensionAPI): void {
  pi.registerProvider("provider-id", {
    baseUrl: "https://api.example.com/v1",
    apiKey: "ENV_VAR_NAME",
    api: "openai-completions",
    headers: {
      "X-Title": "Pi",
      "HTTP-Referer": "https://example.ai/",
    },
    models: [
      {
        id: "provider/model-name",
        name: "Display Name",
        reasoning: false,
        input: ["text", "image"],
        cost: {
          input: 0.5,
          output: 1.5,
          cacheRead: 0.1,
          cacheWrite: 1.2,
        },
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
  });
}
```

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | `string` | Base API endpoint URL |
| `apiKey` | `string` | Environment variable name for API key |
| `api` | `string` | API type (e.g., `openai-completions`) |
| `headers` | `Record<string, string>` | Optional custom headers sent with requests |
| `models` | `ModelDefinition[]` | Array of model definitions |

## Model Definition

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Provider-specific model ID (e.g., `google/gemini-2.0-flash`) |
| `name` | `string` | Display name shown in UI |
| `reasoning` | `boolean` | Whether model supports reasoning tokens |
| `input` | `string[]` | Input modalities (`text`, `image`, `file`) |
| `cost` | `object` | Pricing per 1M tokens |
| `contextWindow` | `number` | Maximum context window size |
| `maxTokens` | `number` | Maximum output tokens |

## Integration

```typescript
// extensions/<name>/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerAllProviders } from "./providers";

export default function (pi: ExtensionAPI) {
  registerAllProviders(pi);
}
```

## Usage with OpenRouter

When using OpenRouter:
- Model IDs must include provider prefix (e.g., `google/gemini-2.0-flash`)
- Set custom headers: `X-Title` and `HTTP-Referer` for identification
- Use environment variable like `OPENROUTER_GOOGLE_API_KEY`