/**
 * @aliou/pi-utils-settings
 *
 * Shared settings infrastructure for pi extensions:
 * - ConfigLoader: load/save/merge JSON configs from global + project paths
 * - registerSettingsCommand: create a settings command with Local/Global tabs
 * - Wizard: multi-step wizard component with tabbed navigation and borders
 * - SectionedSettings: sectioned settings list component
 * - ArrayEditor: string array editor submenu component
 * - Helpers: nested value access, display-to-storage value mapping
 */

export {
  ArrayEditor,
  type ArrayEditorOptions,
} from "./components/array-editor";
export {
  FuzzySelector,
  type FuzzySelectorOptions,
} from "./components/fuzzy-selector";
export {
  PathArrayEditor,
  type PathArrayEditorOptions,
} from "./components/path-array-editor";
export {
  SectionedSettings,
  type SectionedSettingsOptions,
  type SettingsSection,
} from "./components/sectioned-settings";
export {
  Wizard,
  type WizardOptions,
  type WizardStep,
  type WizardStepContext,
} from "./components/wizard";
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
