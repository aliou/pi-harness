# Apple Foundation Model Provider

Pi provider for Apple's on-device Foundation Model (~3B parameters). Runs entirely offline on Apple Silicon. Free, private, no API key needed.

## Requirements

- macOS 26 (Tahoe) or later
- Apple Silicon (M1+)
- Apple Intelligence enabled in System Settings

## Model Details

| Property | Value |
|----------|-------|
| Parameters | ~3B |
| Context window | 4,096 tokens (input + output combined) |
| Cost | Free (on-device) |
| Privacy | Fully offline, no data leaves the device |
| Supported input | Text only |

## Usage

The provider registers as `apple-fm` with model ID `apple-foundation-model`.

Use it for lightweight tasks where the 4,096 token limit is not a constraint:
- Title generation
- Summarization
- Text extraction
- Short-form text generation

Not suitable for coding agent workflows (context window is too small for system prompts + tool definitions + code).

### Example: Using in Another Extension

```typescript
import { completeSimple, getModel } from "@mariozechner/pi-ai";

const model = getModel("apple-fm", "apple-foundation-model");
const response = await completeSimple(
  model,
  { systemPrompt: "Generate a short title.", messages },
  {},
);
```

## Architecture

The extension consists of two components:

1. **Swift CLI bridge** (`bin/apple-fm-bridge`): A compiled macOS binary that wraps Apple's `FoundationModels` framework. Reads a JSON request from stdin, streams NDJSON response lines to stdout.

2. **Pi extension** (`index.ts`): Registers the provider with a custom `streamSimple` function that spawns the bridge process per request.

### Bridge Protocol

**Request** (JSON on stdin):
```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Summarize this text..." }
  ],
  "temperature": 0.7,
  "max_tokens": 256
}
```

**Response** (NDJSON on stdout):
```
{"type":"start"}
{"type":"delta","content":"Here is"}
{"type":"delta","content":" a summary..."}
{"type":"done","content":"Here is a summary...","usage":{"input_tokens":15,"output_tokens":8}}
```

**Error**:
```
{"type":"error","message":"Model unavailable","code":"model_unavailable"}
```

### Availability Check

```bash
./bin/apple-fm-bridge --check
# {"available":true}
```

## Building from Source

Requires Xcode 26 with the macOS 26 SDK.

```bash
cd extensions/apple-fm/bridge

# Using the Xcode toolchain Swift
/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swift build -c release

# Copy binary
cp .build/release/apple-fm-bridge ../bin/apple-fm-bridge
```

## Limitations

- **4,096 token combined limit**: Input and output share the same budget. Long prompts leave little room for responses.
- **No tool calling**: The bridge does not support function/tool calling. Tool-heavy workflows will not work.
- **Single-turn only**: Multi-turn conversations are approximated by injecting prior turns into the prompt context, which consumes tokens.
- **Token estimates**: Usage numbers are approximated (~4 chars per token). Apple does not expose a public tokenizer API.
- **Text only**: Image input is not supported in this version (Apple Foundation Models do support images; this can be added later).
