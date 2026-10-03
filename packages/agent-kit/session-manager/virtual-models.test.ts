import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import type {
  ExtensionContext,
  ExtensionFactory,
  ModelRouteRequest,
} from "@earendil-works/pi-coding-agent";
import * as sdk from "@earendil-works/pi-coding-agent";
import { loadExtensionFromFactory } from "@harness/test-utils/load-extension";
import { vol } from "memfs";
import { Type } from "typebox";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubagentSessionRecordStore } from "../session-records";
import type { ResolvedSubagentConfig } from "../types";
import { SubagentSessionManager } from "./session-manager";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof sdk>();
  return { ...actual, discoverAndLoadExtensions: vi.fn() };
});

afterEach(() => vi.restoreAllMocks());

describe("virtual subagent sessions", () => {
  it("loads the resolved path, routes with the child context, and preserves the child's pin on resume", async () => {
    const root = "/installed/rig";
    const routingPath = `${root}/hooks/virtual-models/index.ts`;
    vol.fromJSON({
      [`${root}/package.json`]: JSON.stringify({ name: "@aliou/pi-rig" }),
    });
    vi.spyOn(sdk.DefaultPackageManager.prototype, "resolve").mockResolvedValue({
      extensions: [
        {
          path: routingPath,
          enabled: true,
          metadata: {
            source: root,
            scope: "user",
            origin: "package",
            packageRoot: root,
          },
        },
      ],
      skills: [],
      prompts: [],
      themes: [],
    });

    const physical = fauxProvider({
      provider: "test-physical",
      models: [{ id: "test-model" }],
    });
    const provider: typeof physical.provider = {
      ...physical.provider,
      auth: {
        apiKey: {
          name: "Test",
          check: async () => ({ type: "api_key", source: "test" }),
          resolve: async () => ({
            auth: { apiKey: "test-key" },
            source: "test",
          }),
        },
      },
    };
    const parentRuntime = await sdk.ModelRuntime.create({ modelsPath: null });
    parentRuntime.registerNativeProvider(provider);
    await parentRuntime.setRuntimeApiKey("test-physical", "test-key");
    const routeContexts: ExtensionContext[] = [];
    const routeStates: unknown[] = [];
    const factory: ExtensionFactory = (pi) => {
      pi.registerVirtualModel<{ provider: string; modelId: string }>({
        provider: "agents",
        id: "scout",
        name: "Scout",
        route(request, ctx) {
          routeContexts.push(ctx);
          routeStates.push(request.state);
          const state = request.state ?? {
            provider: "test-physical",
            modelId: "test-model",
          };
          const model = ctx.modelRegistry.find(state.provider, state.modelId);
          if (!model) throw new Error("Missing inherited provider");
          return {
            model,
            thinkingLevel: "off",
            state: request.state ? undefined : state,
          };
        },
      });
    };
    parentRuntime.registerVirtualModel({
      provider: "agents",
      id: "scout",
      name: "Scout",
      route(_request: ModelRouteRequest) {
        throw new Error("Parent router must not run");
      },
    });
    const registry = new sdk.ModelRegistry(parentRuntime);
    const selected = registry.find("agents", "scout");
    if (!selected) throw new Error("Missing virtual model");

    const discovery = vi
      .mocked(sdk.discoverAndLoadExtensions)
      .mockImplementation(async (paths, cwd) => {
        expect(paths).toContain(routingPath);
        const runtime = sdk.createExtensionRuntime();
        const extension = await loadExtensionFromFactory(
          factory,
          cwd,
          sdk.createEventBus(),
          runtime,
          routingPath,
        );
        return { extensions: [extension], errors: [], runtime };
      });
    const parentSession = sdk.SessionManager.inMemory();
    const ctx = {
      cwd: "/parent",
      modelRegistry: registry,
      sessionManager: parentSession,
    } as unknown as ExtensionContext;
    const parameters = Type.Object({ task: Type.String() });
    const config: ResolvedSubagentConfig<typeof parameters> = {
      name: "scout",
      label: "Scout",
      description: "test",
      systemPrompt: "test",
      tools: [],
      parameters,
      buildPrompt: () => ({ text: "test" }),
      configured: true,
      modelPreferences: [
        { provider: "agents", model: "scout", thinking: "off", weight: 1 },
      ],
    };
    const records = new SubagentSessionRecordStore({
      appendEntry: (customType: string, data: unknown) => {
        parentSession.appendCustomEntry(customType, data);
      },
    } as unknown as sdk.ExtensionAPI);
    const manager = new SubagentSessionManager(config, records);
    const choice = {
      model: selected,
      thinking: "off" as const,
      preference: {
        provider: "agents",
        model: "scout",
        thinking: "off" as const,
      },
      skipped: [],
    };
    const child = await manager.createSession(
      ctx,
      choice,
      [],
      [],
      [],
      "/child",
    );
    physical.setResponses([
      fauxAssistantMessage("First answer"),
      fauxAssistantMessage("Resumed answer"),
    ]);
    try {
      await child.prompt("First question");
      const last = child.messages.at(-1);
      if (last?.role === "assistant" && last.stopReason === "error") {
        throw new Error(last.errorMessage);
      }
      expect(child.getLastAssistantText()).toBe("First answer");
      expect(routeContexts[0]?.cwd).toBe("/child");
      expect(routeContexts[0]?.sessionManager.getSessionId()).toBe(
        child.sessionId,
      );
      expect(
        parentSession
          .getBranch()
          .some(
            (entry) =>
              entry.type === "custom" &&
              entry.customType === "pi.virtual-model-state",
          ),
      ).toBe(false);
      manager.recordSession(ctx, child, choice, []);
    } finally {
      child.dispose();
    }

    const resumed = await manager.resume(child.sessionId, ctx, [], "/child");
    try {
      await resumed.prompt("Second question");
      expect(resumed.getLastAssistantText()).toBe("Resumed answer");
      expect(routeStates).toEqual([
        undefined,
        { provider: "test-physical", modelId: "test-model" },
      ]);
      expect(resumed.model?.provider).toBe("agents");
      expect(discovery).toHaveBeenCalledTimes(2);
    } finally {
      resumed.dispose();
    }
  });
});
