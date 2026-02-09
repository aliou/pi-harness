# @aliou/pi-extension-dev

## 0.4.0

### Minor Changes

- 3452b4e: pi_docs and pi_changelog tools now use the built-in expanded/collapsed toggle (Ctrl+O). Collapsed view shows compact summaries, expanded view shows full details. New pi_changelog_versions tool for listing available versions separately.

## 0.3.0

### Minor Changes

- 3f22ea6: Update tool return type docs to use `content` blocks instead of `output` string, add error handling section documenting throw-based error reporting.

## 0.2.1

### Patch Changes

- 82c1d39: Move pi-extension skill into extension-dev package, add tool delegation warning in skill docs, standardize peerDependencies to >=0.51.0.

## 0.2.0

### Minor Changes

- 4ac87a8: Add demo-setup skill and /setup-demo prompt for creating extension demo environments.

## 0.1.1

### Patch Changes

- dccbf2d: Add preview video to package.json for the pi package browser.

## 0.1.0

### Minor Changes

- 3324434: Initial release of @aliou/pi-extension-dev, replacing @aliou/pi-meta.

  Tools: pi_version, pi_changelog, pi_docs, detect_package_manager.
  Command: /extensions:update [VERSION] - update Pi extensions to installed or latest version.
