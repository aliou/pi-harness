import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModeDefinition } from "./modes";
import { DEFAULT_MODE } from "./modes";

let currentMode: ModeDefinition = DEFAULT_MODE;
let sessionAllowedTools: Set<string> = new Set();
let previousModel: Model<Api> | undefined;
let requestRender: (() => void) | undefined;

export function getCurrentMode(): ModeDefinition {
  return currentMode;
}

export function setCurrentMode(mode: ModeDefinition): void {
  currentMode = mode;
}

export function getSessionAllowedTools(): Set<string> {
  return sessionAllowedTools;
}

export function clearSessionAllowedTools(): void {
  sessionAllowedTools = new Set();
}

export function getPreviousModel(): Model<Api> | undefined {
  return previousModel;
}

export function setPreviousModel(model: Model<Api> | undefined): void {
  previousModel = model;
}

export function clearPreviousModel(): void {
  previousModel = undefined;
}

export function resetModeState(): void {
  clearSessionAllowedTools();
  clearPreviousModel();
}

export function addSessionAllowedTool(key: string): void {
  sessionAllowedTools.add(key);
}

export function setRequestRender(fn: (() => void) | undefined): void {
  requestRender = fn;
}

export function triggerRender(): void {
  requestRender?.();
}
