# Prompting Qwen3.8-27B

Qwen3.8-27B is Alibaba's 27B dense vision-language model with open weights. It handles images and video natively, and its thinking can be switched on or off. Synthetic's `syn:small:vision` alias currently routes to it. Sessions from September 2026 report `Qwen/Qwen3.8-27B` as the response model. The alias can move to another model without notice, so check the reported response model before tuning prompts for it.

## Model profile

- Best fit: image and document reading, UI screenshots, chart and diagram questions, and compact agentic coding.
- Context: 262,144 tokens natively. It can reach 1M tokens with YaRN scaling, and some hosted APIs offer 1M by default.
- Thinking: on by default and can be disabled per request. `reasoning_effort` accepts `xhigh` (default), `medium`, and `low`. On Synthetic's alias, Pi exposes only `off` and `medium`.
- Preserved thinking: `preserve_thinking` is on by default and keeps reasoning from earlier turns.
- Sampling (official recommendation): thinking mode uses `temperature=1.0`, `top_p=0.95`, `top_k=20`. Non-thinking mode uses `temperature=0.7`, `top_p=0.80`, `top_k=20`, `presence_penalty=1.5`. A `presence_penalty` between 0 and 2 reduces endless repetition.

## Give one bounded visual job

Name what to inspect in the image, what to ignore, and the output shape. Ask the model to separate what it sees from what it infers, and to answer "not visible" when a detail cannot be read. Supply file or tool evidence for anything the pixels cannot show.

```text
From this screenshot, list every visible error message verbatim and the component it
appears in. Ignore the sidebar. Mark anything you cannot read as "not visible". Do not
infer the cause.
```

## Choose thinking by task, not by habit

Non-thinking mode suits simple reads and transcription. Use thinking at `medium` or higher for diagram reasoning, multistep visual questions, and agentic tasks. Qwen warns that lower effort does not always shorten a whole agentic task: shallow analysis can cause failures and retries that cost more in total.

Leave enough output room. Qwen's reference setup allows up to 262,144 reasoning tokens and 131,072 answer tokens for agentic work.

## Common failure modes

| Symptom | Response |
| --- | --- |
| Endless repetition | Raise `presence_penalty` within 0–2 where the provider supports it. |
| Guessed details from a blurry image | Require "not visible" for unreadable details. |
| Alias behavior changes suddenly | Check the reported response model. The alias may have been rerouted. |
| Shallow answer on a reasoning-heavy image | Turn thinking on or raise effort. |

## Sources

- Qwen, [Qwen3.8-27B model card](https://huggingface.co/Qwen/Qwen3.8-27B)
- Qwen Cloud, [Qwen3.8-27B overview](https://www.qwencloud.com/models/qwen3.8-27b)
- Synthetic, [`syn:*` category model IDs (pi-synthetic README)](https://github.com/aliou/pi-synthetic)
