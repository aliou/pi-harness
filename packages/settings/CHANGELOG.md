# @aliou/pi-utils-settings

## 0.2.0

### Minor Changes

- 06e7e0c: Add flexible scope system with memory support

  - Add `Scope` type (`global`, `local`, `memory`)
  - Add `scopes` constructor option to ConfigLoader (default: `["global", "local"]`)
  - Walk up directory tree to find `.pi` for local config
  - Memory scope: ephemeral, not persisted, resets on reload
  - Dynamic tabs in settings command based on enabled scopes
  - Add `isInherited()` helper for memory tab display
  - Add `hasScope()`, `getEnabledScopes()` to ConfigStore interface

## 0.1.0

### Minor Changes

- 6432484: Initial release: ConfigLoader with migrations and afterMerge hook, registerSettingsCommand with Local/Global tabs and draft-based Ctrl+S save, SectionedSettings, ArrayEditor, and helpers.
