---
"@aliou/pi-processes": patch
---

Fix process command shell resolution to avoid relying on `$SHELL`.

- Keep explicit settings override via `execution.shellPath`
- Fallback to known bash paths for consistent `-lc` behavior
- Add/update unit tests for resolver behavior
