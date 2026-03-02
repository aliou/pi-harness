# @aliou/pi-utils-settings

## 0.7.0

### Minor Changes

- a3039d9: Add a reusable `SettingsDetailEditor` component for focused second-level settings editing.

  - Support typed detail fields: text, enum, boolean, nested submenu, and destructive action with confirmation
  - Add keyboard UX for detail panels (`↑/↓` or `j/k`, `Enter`, `Esc`)
  - Show selected field descriptions and keep nested submenu handoff/return clean
  - Add tests for navigation and field callback behavior
  - Update docs with guidance on `SectionedSettings` vs `SectionedSettings + SettingsDetailEditor`
  - Extend reference example with an array-of-objects pattern (`profiles`) using nested detail editors

## 0.6.0

### Minor Changes

- 8f1e5a9: Add `FuzzyMultiSelector` (with `FuzzyMultiSelectorItem` and `FuzzyMultiSelectorOptions`) to support fuzzy-searchable multi-select workflows in extension UIs.

## 0.5.1

### Patch Changes

- 2f5ec32: mark pi SDK peer deps as optional to prevent koffi OOM in Gondolin VMs

## 0.5.0

### Minor Changes

- e4dc2d8: Add Wizard component with tabbed steps, borders, and progress tracking. Add DynamicBorder component for settings UI. Add goNext/goPrev to WizardStepContext. Fix FuzzySelector Enter handling. Add pi-utils-settings skill and reference extension.

## 0.4.0

### Minor Changes

- 7df01a2: Pass `ExtensionCommandContext` to `onSave` callback in settings command options

## 0.3.0

### Minor Changes

- 756552a: Add FuzzySelector component for picking one item from a large list using fuzzy search. Refresh sections after cycling value changes so dependent settings update immediately.

## 0.2.1

### Patch Changes

- b79b592: Fix search filter to match on section labels, not just item labels. When a section label matches the query, all items in that section are shown.

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
