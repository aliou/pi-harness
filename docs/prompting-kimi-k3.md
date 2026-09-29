# Prompting Kimi K3

Kimi K3 is Moonshot AI's flagship multimodal model for long-horizon coding, end-to-end knowledge work, and deep reasoning. It has a 1M-token context window, native image and video understanding, configurable reasoning effort, and preserved thinking. This guide applies to the model itself, not a particular agent harness.

## Model profile

- Best fit: sustained software engineering, large-codebase work, multi-tool research, complex knowledge work, and tasks that combine code with visual feedback.
- Context: 1M tokens. Use the window to retain relevant evidence and task state, not as a substitute for retrieval, scope, or a stopping condition.
- Reasoning: thinking and preserved thinking are always on. Set the top-level `reasoning_effort` to `low`, `high`, or `max`; `max` is the official API default.
- Provider variants: Neuralwatt's catalog lists `kimi-k3-fast` with reasoning disabled. The thinking and effort guidance here does not apply to that variant.
- Sampling: `temperature=1.0`, `top_p=0.95`, `n=1`, and both penalties at `0` are fixed. Omit these parameters instead of setting them explicitly.
- Tools: `tool_choice` supports `auto`, `none`, and `required`. K3 also supports dynamically loaded tools. Forcing one named function is incompatible with thinking, which cannot be disabled on K3.
- Media: K3 accepts images and video. The official API supports base64 images or uploaded image and video files referenced with `ms://`; public image URLs are unsupported.

## Give it a bounded autonomy contract

State the outcome, relevant evidence, scope, non-negotiable constraints, permission boundaries, verification, and final deliverable. K3 is trained for long, challenging work and may make unexpected decisions when intent is ambiguous, so distinguish reversible local work from destructive actions, external writes, publication, deployment, and scope expansion.

```text
Fix the duplicate background-job scheduling regression.
Inspect the scheduler and its direct callers. Preserve retry semantics and do not
redesign the queue. Implement the smallest safe fix, add a focused regression test,
and run the affected checks. You may make local edits and run tests; do not deploy,
publish, or change infrastructure. Report changed files, validation, and residual risk.
```

For analysis-only work, prohibit edits and define evidence as the deliverable. For ambiguous implementation work, tell the model whether to choose the simplest valid interpretation or stop for a material product decision. Put durable behavioral limits in the system prompt or repository guidance so they remain visible throughout a long run.

Use explicit steps when order is part of correctness, such as retrieve before answering, observe a UI before changing it, or validate after editing. Otherwise prefer a clear finish line over a long prescribed routine. Delimit supplied documents, logs, or examples with headings, XML tags, or fences, and state what each source should contribute.

## Set reasoning effort once per session

Use `low` for bounded, latency-sensitive work; `high` for substantial analysis and implementation; and `max` for the hardest long-horizon or high-stakes tasks. Measure these levels on representative work rather than assuming the default is always worth its cost.

Choose the effort before the conversation starts and keep it stable. Changing effort invalidates prefix-cache hits. Do not try to disable thinking or simulate an effort level in prompt prose.

K3 is sensitive to thinking history. In multi-turn conversations and tool loops, append every complete assistant message returned by the API unchanged, including `reasoning_content` and `tool_calls`. Do not retain only `content`, rewrite the reasoning, or switch an existing session from another model to K3. Start a new K3 session instead.

## Make tools selective and evidence-led

Tool descriptions should state the tool's purpose, when to use it, parameter meaning, and expected result. Use `tool_choice: "required"` when a turn must retrieve current or private evidence and the available tools are limited to read-only retrieval, then return to `auto`; use `none` when a plain response must not trigger tools.

Do not expose dozens or hundreds of tools at once. Moonshot recommends declaring a small set of core tools plus a backend `search_tools` function, forcing retrieval on the first turn when needed, and injecting complete matching tool definitions later through a `system` message with a `tools` field. That dynamic declaration message must not contain `content`; keep prompt instructions in a separate system message. Keep dynamically loaded declarations in subsequent request history while the tools remain needed.

```text
Use repository and test output as evidence. Do not answer file-specific questions from
memory. Cite paths and symbols for the verified failure path. Stop when one cause is
proved and the focused checks pass, or report the concrete blocker and missing evidence.
```

Give long loops a retry or turn budget and a terminal condition. Execute every returned call, append the complete assistant message, and return one matching tool result for each `tool_call_id` before asking the model to continue.

## Use long context, media, and structured output deliberately

Keep stable instructions and large reference material at the beginning of the conversation so automatic prefix caching can reuse them. Append changing questions and results afterward. Retrieve or index relevant sections before fine-grained analysis; a 1M-token window does not make an unscoped repository dump a good prompt.

For screenshots, diagrams, and video, identify the exact visible evidence to inspect and what to ignore. Ask the model to separate observation from interpretation and provide source files or tools for facts that pixels cannot establish. Keep images at or below 4K and video at or below FHD; higher resolutions cost more without improving understanding according to Moonshot.

For machine-consumed output, prefer `response_format` with `json_schema` and `strict: true` over describing JSON only in the prompt. Define nullable fields for missing data so the model can return `null` rather than fabricate a value. Confirm that `finish_reason` is not `length` before parsing; treat truncated output as an error or retry path. Parse only `message.content`, never `reasoning_content`, and still explain the business task and evidence source in the prompt.

## Common failure modes

| Symptom | Response |
| --- | --- |
| Agent broadens scope or makes a product decision | State the smallest allowed change, excluded work, and explicit approval checkpoints in durable instructions. |
| Quality becomes unstable during a long session | Preserve complete assistant messages unchanged and start a new session when switching to K3 from another model. |
| Reasoning is slow or expensive for a bounded task | Start a new session at `low` or `high`; do not switch effort repeatedly inside a cached conversation. |
| Tool choice is wrong or arguments degrade | Expose fewer tools, improve descriptions and schemas, and load specialized tools on demand. |
| Model answers a current question from memory | Require retrieval with `tool_choice: "required"`, then switch back to `auto` after evidence arrives. |
| Large context hides the important evidence | Name relevant paths, sections, entities, and answer criteria; retrieve focused material first. |
| Visual conclusions invent hidden behavior | Request visible observations first and supply source or tool evidence for inaccessible state. |
| Structured data is missing or fabricated | Use strict JSON Schema and nullable required fields, then validate `message.content`. |

## Sources

- Moonshot AI, [Kimi K3 quickstart](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart)
- Moonshot AI, [Kimi K3 technical blog and limitations](https://www.kimi.com/blog/kimi-k3)
- Moonshot AI, [prompt best practices](https://platform.kimi.ai/docs/guide/prompt-best-practice)
- Moonshot AI, [model parameter reference](https://platform.kimi.ai/docs/api/models-overview)
- Moonshot AI, [reasoning effort](https://platform.kimi.ai/docs/guide/use-reasoning-effort)
- Moonshot AI, [Kimi K3 tool-calling best practices](https://platform.kimi.ai/docs/guide/kimi-k3-tool-calling-best-practice)
- Moonshot AI, [dynamic tool loading](https://platform.kimi.ai/docs/guide/use-dynamic-tool-loading)
- Moonshot AI, [vision input](https://platform.kimi.ai/docs/guide/use-kimi-vision-model)
- Moonshot AI, [structured output](https://platform.kimi.ai/docs/guide/response_format)
- Moonshot AI, [context caching](https://platform.kimi.ai/docs/guide/use-context-caching-feature-of-kimi-api)
