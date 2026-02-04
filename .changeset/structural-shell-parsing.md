---
"@aliou/pi-guardrails": minor
---

Replace regex-based command matching with structural shell parsing via @aliou/sh. Eliminates false positives where keywords appear in string arguments, commit messages, grep patterns, or URLs. Adds glob expansion for env file protection, v0 config migration, and regex toggle in pattern editor.
