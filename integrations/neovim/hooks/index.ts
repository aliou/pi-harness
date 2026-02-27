import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  type NvimConnectionState,
  registerNvimContextHook,
} from "./nvim-context";

export type { NvimConnectionState } from "./nvim-context";

export function setupNvimHooks(pi: ExtensionAPI, state: NvimConnectionState) {
  registerNvimContextHook(pi, state);
}
