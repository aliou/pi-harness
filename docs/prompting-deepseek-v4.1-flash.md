# Prompting DeepSeek V4.1 Flash

DeepSeek V4.1 Flash is DeepSeek's small, cheap multimodal model. It is the first model in DeepSeek's new architecture family, and DeepSeek reports it ahead of V4-Pro on its benchmarks. DeepSeek documents the API and thinking behavior but publishes no prompting guide. The guidance below covers the documented controls plus what we have observed in this harness.

## Model profile

- Architecture: 552B-parameter MoE with a causal encoder-decoder design. It activates 8B parameters during prefill and 16B during decode, which makes input-heavy agent loops cheap.
- Context: 1M tokens. Text and image input.
- Model IDs: `deepseek-flash` on DeepSeek's API. The old `deepseek-v4-flash` names temporarily route to it. Neuralwatt serves it as `deepseek-v4.1-flash`.
- Thinking: on by default at `high`. Disable it with `thinking: {"type": "disabled"}` or `reasoning_effort: "none"`.
- Effort: native levels are `low`, `high`, and `max`. `minimal` maps to `low`. `medium` and `xhigh` map to `high` on DeepSeek's API, and `ultra` maps to `max`. Neuralwatt exposes `xhigh` as its own level and maps `medium` to `high`. Internally, effort is a 1–100 budget where `low` is 50, `high` is 75, and `max` is 100.
- Sampling: in thinking mode, `temperature` and the penalties have no effect, and `top_p` below 0.95 is raised to 0.95.

## Return reasoning in tool loops

Any request that carries `tools` must send back the full `reasoning_content` of every earlier assistant turn, including turns with no tool call. Otherwise the API returns a 400 error. Requests without tools ignore past reasoning. Append complete assistant messages, and do not keep only `content`.

## Write a bounded, evidence-first task

DeepSeek gives no model-specific prompt rules, so use a plain task contract: the goal, the root or inputs, the scope, the evidence standard, the answer shape, and when to stop. In this harness, V4.1 Flash ran clean on the generic `scout` prompt (68 runs: no invented tools, no loops, no fake tool-call text). Its predecessor, V4 Flash, sometimes called tools that did not exist. Keep the tool list small, describe each tool clearly, and name the only allowed tools when mistakes are costly.

## Choose effort per task

Use `high` (the default) for codebase research and multistep tool work. Use `max` for the hardest reasoning, and `low` or `none` for classification or short extraction. Reasoning is billed as output, so measure token use at each level before raising it.

## Common failure modes

| Symptom | Response |
| --- | --- |
| 400 error mid tool loop | Send back all earlier `reasoning_content` when `tools` is present. |
| `temperature` has no effect | Expected in thinking mode. Steer with the prompt or effort instead. |
| Calls to tools that do not exist | Keep the tool list short and name the only allowed tools. |
| Costs climb at `max` | Drop to `high` unless evals show a gain. |

## Sources

- DeepSeek, [DeepSeek-V4.1-Flash release](https://api-docs.deepseek.com/news/news260910)
- DeepSeek, [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode)
- DeepSeek, [Change log](https://api-docs.deepseek.com/updates)
- DeepSeek, [DeepSeek-V4.1-Flash model card](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)
- DeepSeek, [V4.1 prompt encoding reference](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/encoding/README.md)
