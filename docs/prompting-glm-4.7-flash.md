# Prompting GLM-4.7-Flash

GLM-4.7-Flash is Z.ai's lightweight, fast member of the GLM-4.7 series. It has a 200K context window, 128K maximum output, tool calling, structured output, and configurable thinking. Use it for bounded work that benefits from speed and explicit structure, not as a substitute for a large-model open-ended investigation.

Synthetic's `syn:small:text` alias currently routes to GLM-4.7-Flash. Sessions from September 2026 report `zai-org/GLM-4.7-Flash` as the response model. The alias can move to another model, so check the reported response model before tuning prompts for it.

## Model profile

- Best fit: narrow extraction, classification, concise transformation, focused repository or session lookup, and low-cost tool steps.
- Context: 200K tokens is ample for a selected transcript or document, but not a reason to ask the model to understand an entire unscoped project.
- Reasoning: thinking is enabled by default for the GLM-4.7 series and can be disabled per turn. GLM-4.7 uses forced thinking when enabled.
- Tools: interleaved thinking supports reasoning between tool calls. Preserve unmodified `reasoning_content` with assistant turns and tool results in a multi-step loop.

## Give one bounded job

State the source, exact question, allowed search area, missing-evidence behavior, and response schema. Do not ask for a generic summary when the caller needs a fact that can be verified.

```text
Read session <ID>. Extract the final database decision, changed files, commands that
were actually run, and unresolved questions. Cite session evidence for each field.
If a field is absent, return "not found". Do not infer intent from unrelated turns.
```

For structured extraction, supply a concrete JSON schema, required versus optional fields, and a null or `not found` policy. For research, name repositories, paths, symbols, version range, and what to ignore. Request source citations or stable IDs for conclusions that affect a next action.

Keep the response format small and deterministic. The model is fast because the task should be narrow; a vague prompt forces it to spend context discovering what it should have been told.

## Use thinking and tools deliberately

Disable thinking for simple lookup, formatting, classification, or translation work when a direct response is adequate. Enable it for multi-constraint extraction, ambiguous evidence resolution, multi-step tooling, and non-trivial code or document analysis. Treat this as a latency and cost choice, and test it on the actual task distribution.

When tools are involved:

- Give each tool a literal description of when it is required and the expected result shape.
- Preserve `reasoning_content` exactly and in order across assistant and tool turns; do not edit or reorder it.
- Return tool results promptly and keep the loop bounded with an iteration or stop condition.
- Ask the model to distinguish observed evidence from inference and to report missing evidence plainly.

For long inputs, preselect or retrieve relevant sections. Ask for exact identifiers, quotes, dates, paths, or commands rather than broad impressions.

## Common failure modes

| Symptom | Response |
| --- | --- |
| Generic summary instead of usable extraction | Specify fields, evidence requirements, and `not found` behavior. |
| Unsupported conclusion | Require a source anchor and evidence/inference separation. |
| Unnecessary latency on a trivial task | Disable thinking and constrain the output schema. |
| Tool loop loses coherence | Preserve returned `reasoning_content` exactly with the tool history. |
| Broad work drifts or loses important detail | Split it into bounded retrieval/extraction stages or use a larger model. |

## Sources

- Z.ai, [GLM-4.7 overview](https://docs.z.ai/guides/llm/glm-4.7?id=GLM4.7Flash)
- Z.ai, [Thinking mode](https://docs.z.ai/guides/capabilities/thinking-mode)
- Z.ai, [Core parameters](https://docs.z.ai/guides/overview/concept-param)
- Simon Willison, [GLM model notes](https://simonwillison.net/tags/glm/)
