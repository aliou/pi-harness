# Prompting GLM-5.3 and GLM-5.3-Flash

GLM-5.3 is Z.ai's text-only flagship for coding and long-horizon agent work. GLM-5.3-Flash is a separate, much cheaper model with native vision. Its base model is new, and Z.ai reports it near Claude Opus 4.8 on coding and agentic benchmarks. Both always think, and both take the same effort levels. Z.ai publishes API settings and task examples for them, but no separate prompting guide.

## Model profile

- GLM-5.3 (`glm-5.3`): same base model as GLM-5.2 with new post-training. Text only, 1M context, 128K max output. Reported gains over GLM-5.2 on Terminal-Bench 3.0, DeepSWE, and Agents' Last Exam.
- GLM-5.3-Flash (`glm-5.3-flash`): 320B total, 18B active parameters, with hybrid sparse and linear attention. Accepts text, image, video, and file input, with a 1M context. Z.ai reports it beating GLM-5.2 at about one-tenth the price.
- Thinking: always on. `thinking.type` accepts only `enabled`, and `disabled` fails.
- Effort: `reasoning_effort` accepts `low`, `high`, and `max`, and defaults to `max`. On the Synthetic and Neuralwatt catalogs here, `medium` is not a native level and resolves to `high`, and `off` is unavailable.
- Recommended settings: `temperature: 1`, `top_p: 0.95`, and `reasoning_effort: max` for complex work such as coding.
- Thinking history: interleaved thinking between tool calls is on by default. Preserved thinking (`clear_thinking: false`) is recommended for agent and coding loops. Return every `reasoning_content` block unchanged and in order.

## Give a bounded task with a stated deliverable

The task examples in Z.ai's docs share one shape: name the goal and the inputs, analyze first, do the work, check the result, and report what was verified and what remains open. They also forbid invented data. Reuse that shape:

```text
Trace how the retry policy is applied to outgoing webhook calls. Inspect only the
dispatcher and its direct callers. Cite files and line ranges for each step. Do not
invent paths or symbols. Report the verified call path, then list anything you could
not confirm.
```

State the deliverable, the scope limits, the evidence standard, and the stopping point. For research, ask the model to separate direct evidence from inference. For an unknown fact, ask for "not found" or a listed assumption instead of a guess.

State these once, where they belong. In replay evals of this harness's subagents on GLM-5.3-Flash, extra prompt ceremony did not help:

- In `scout`, where the system prompt already sets scope, evidence, and stopping, a user-prompt preamble repeating them lost blind comparisons 5 to 9. In one live case it ended without a final answer twice.
- In `oracle`, a fixed four-part output and mandatory line-range citations lost 2 to 8 to the generic prompt. A short task-first preamble that defers to the task's requested answer shape won 8 to 4.
- In `read_session`, a one-line bounded-research preamble tied the generic prompt.

## Tune effort, not prompt ceremony

Thinking cannot be disabled, so effort is the only lever. Use `max` for hard coding and long-horizon work, `high` for most substantial tasks, and `low` for bounded, latency-sensitive jobs. Z.ai reports that GLM-5.3 at `high` uses about 50K output tokens per coding task, compared with about 75K at `max`. Measure on real work before choosing.

Avoid trivial one-shot tasks at low effort that must end with exactly one tool call. In this harness, GLM-5.3-Flash at `low` looped on the session-naming task ("Done. Stop." repeated until the 65,536-token output limit) in 17 of 24 runs. It had no loops at `high` or `max` across more than 100 `scout` and `read_session` runs. Cap `max_tokens` for small tasks.

## Tool loops and long context

List the allowed tools, what each should establish, and when to stop. Send back the full reasoning history in tool loops. Use retrieval to focus the 1M window instead of loading whole repositories. For visual work with Flash, name the visible evidence to inspect and ask the model to compare the rendered result against the reference.

## Common failure modes

| Symptom | Response |
| --- | --- |
| Request fails after switching from GLM-5.2 | Replace `thinking: disabled` with `enabled` plus `reasoning_effort: low`. |
| Repetitive filler until the output limit | Raise effort above `low` for that task and set a small `max_tokens`. |
| Quality drops across a tool loop | Return all `reasoning_content` unchanged and in order. |
| Broad, unfocused research | Name the root, the behavior, the evidence standard, and the stopping point. |
| Invented values | Require "not found" or labeled assumptions for missing facts. |

## Sources

- Z.ai, [GLM-5.3 guide](https://docs.z.ai/guides/llm/glm-5.3)
- Z.ai, [GLM-5.3-Flash guide](https://docs.z.ai/guides/vlm/glm-5.3-flash)
- Z.ai, [GLM-5.3-Flash blog](https://z.ai/blog/glm-5.3-flash)
- Z.ai, [Thinking mode](https://docs.z.ai/guides/capabilities/thinking-mode)
- Z.ai, [GLM-5.3-Flash model card](https://huggingface.co/zai-org/GLM-5.3-Flash)
- Z.ai, [GLM-5 repository README](https://github.com/zai-org/GLM-5)
