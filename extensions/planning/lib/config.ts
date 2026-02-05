/**
 * Planning extension configuration
 *
 * Settings are loaded from ~/.pi/agent/extensions/planning.json (global only).
 */

import { ConfigLoader } from "@aliou/pi-utils-settings";

export interface PlanningConfig {
  /** Directory where archived plans are stored (should be a git repo) */
  archiveDir?: string;
}

export interface ResolvedPlanningConfig {
  archiveDir: string;
}

const DEFAULTS: ResolvedPlanningConfig = {
  archiveDir: "",
};

export const configLoader = new ConfigLoader<
  PlanningConfig,
  ResolvedPlanningConfig
>("planning", DEFAULTS, { scopes: ["global"] });
