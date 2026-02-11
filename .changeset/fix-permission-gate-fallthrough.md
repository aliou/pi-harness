---
"@aliou/pi-guardrails": patch
---

Fix false positives in permission gate when dangerous keywords appear inside command arguments (e.g. "sudo" in a git commit message). When structural AST matching succeeds, skip the redundant substring match on the raw command string.
