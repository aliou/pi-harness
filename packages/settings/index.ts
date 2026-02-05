/**
 * @aliou/pi-utils-settings
 *
 * Shared settings infrastructure for pi extensions:
 * - ConfigLoader: load/save/merge JSON configs from global + project paths
 * - registerSettingsCommand: create a settings command with Local/Global tabs
 * - SectionedSettings: sectioned settings list component
 * - ArrayEditor: string array editor submenu component
 * - Helpers: nested value access, display-to-storage value mapping
 */

export {
  ArrayEditor,
  type ArrayEditorOptions,
} from "./components/array-editor";
export {
  SectionedSettings,
  type SectionedSettingsOptions,
  type SettingsSection,
} from "./components/sectioned-settings";
export {
  ConfigLoader,
  type ConfigStore,
  type Migration,
  type Scope,
} from "./config-loader";
export {
  displayToStorageValue,
  getNestedValue,
  setNestedValue,
} from "./helpers";
export {
  registerSettingsCommand,
  type SettingsCommandOptions,
} from "./settings-command";
