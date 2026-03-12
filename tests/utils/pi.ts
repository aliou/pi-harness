import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createMock, type PartialFuncReturn } from "./create-mock";

type RegisteredTool = Parameters<ExtensionAPI["registerTool"]>[0];
type ToolContext = NonNullable<Parameters<RegisteredTool["execute"]>[4]>;

type PiMockState = {
  registeredTools: Map<string, RegisteredTool>;
};

const piMockStates = new WeakMap<object, PiMockState>();

function getState(pi: unknown): PiMockState | undefined {
  if (!pi || typeof pi !== "object") return undefined;
  return piMockStates.get(pi);
}

export function createPiDeepMock(options: { cwd?: string } = {}) {
  const cwd = options.cwd ?? mkdtempSync(join(tmpdir(), "pi-test-cwd-"));

  const state: PiMockState = {
    registeredTools: new Map<string, RegisteredTool>(),
  };

  const pi = createMock<ExtensionAPI>(
    {
      registerTool(tool) {
        state.registeredTools.set(tool.name, tool as RegisteredTool);
      },
    },
    { name: "pi" },
  );

  piMockStates.set(pi, state);

  const toolCtx = createMock<ToolContext>(
    {
      cwd,
    } as PartialFuncReturn<ToolContext>,
    { name: "toolCtx" },
  );

  let toolCallCounter = 0;

  function tool(name: string) {
    const registered = state.registeredTools.get(name);
    if (!registered) {
      throw new Error(
        `Tool "${name}" is not registered. Registered: [${[...state.registeredTools.keys()].join(", ")}]`,
      );
    }
    return {
      execute(params: Parameters<typeof registered.execute>[1]) {
        const id = `tc_${++toolCallCounter}`;
        return registered.execute(id, params, undefined, undefined, toolCtx);
      },
    };
  }

  return { pi, tool, cwd };
}

export function hasRegisteredTool(pi: ExtensionAPI, name: string): boolean {
  return getState(pi)?.registeredTools.has(name) ?? false;
}

export function listRegisteredTools(pi: ExtensionAPI): string[] {
  return [...(getState(pi)?.registeredTools.keys() ?? [])];
}
