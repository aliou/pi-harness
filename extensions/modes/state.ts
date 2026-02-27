import type { ModeDefinition } from "./modes";
import { DEFAULT_MODE } from "./modes";

let currentMode: ModeDefinition = DEFAULT_MODE;
let sessionAllowedTools: Set<string> = new Set();
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

export function addSessionAllowedTool(key: string): void {
  sessionAllowedTools.add(key);
}

export function setRequestRender(fn: (() => void) | undefined): void {
  requestRender = fn;
}

export function triggerRender(): void {
  requestRender?.();
}
