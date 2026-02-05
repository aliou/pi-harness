---
"@aliou/pi-utils-settings": minor
---

Add flexible scope system with memory support

- Add `Scope` type (`global`, `local`, `memory`)
- Add `scopes` constructor option to ConfigLoader (default: `["global", "local"]`)
- Walk up directory tree to find `.pi` for local config
- Memory scope: ephemeral, not persisted, resets on reload
- Dynamic tabs in settings command based on enabled scopes
- Add `isInherited()` helper for memory tab display
- Add `hasScope()`, `getEnabledScopes()` to ConfigStore interface
