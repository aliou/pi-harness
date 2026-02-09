# @aliou/pi-toolchain

## 0.3.2

### Patch Changes

- Updated dependencies [756552a]
  - @aliou/pi-utils-settings@0.3.0

## 0.3.1

### Patch Changes

- 2d9a958: update README documentation to match current implementation

## 0.3.0

### Minor Changes

- 523fe5e: Add a new `preventDockerSecrets` blocker feature to reduce accidental secret exfiltration from Docker containers.

  When enabled, toolchain blocks:

  - `docker inspect` (can expose `Config.Env`)
  - `docker exec ... env`
  - `docker exec ... printenv`
  - `docker exec ... cat /proc/<pid>/environ`

  The feature is opt-in and defaults to `false`.

## 0.2.1

### Patch Changes

- Add `preventDockerSecrets` blocker feature to block `docker inspect` and common `docker exec` env-exfiltration commands (`env`, `printenv`, `/proc/*/environ`).

## 0.2.0

### Minor Changes

- 7a3f659: Add memory scope for ephemeral settings overrides

## 0.1.2

### Patch Changes

- Updated dependencies [06e7e0c]
  - @aliou/pi-utils-settings@0.2.0

## 0.1.1

### Patch Changes

- 3471b6c: Explicitly add deps to root package.json
- d73dadb: Reorganize file structure: move commands to commands/, components to components/, utils to utils/. Merge config-schema types into config.ts.

## 0.1.0

### Minor Changes

- 29b61a5: Initial release: package manager rewriting, git rebase rewriting, python rewriting, and brew blocking via spawn hooks. Extracted from @aliou/pi-guardrails.
