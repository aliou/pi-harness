import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { expect } from "vitest";
import { hasRegisteredTool, listRegisteredTools } from "./pi";

expect.extend({
  toHaveRegisteredTool(received: unknown, name: string) {
    const pi = received as ExtensionAPI;
    const pass = hasRegisteredTool(pi, name);
    const registered = listRegisteredTools(pi);

    return {
      pass,
      message: () =>
        pass
          ? `expected pi mock not to have registered tool "${name}"`
          : `expected pi mock to have registered tool "${name}", registered: [${registered.join(", ")}]`,
      actual: registered,
      expected: name,
    };
  },
});

declare module "vitest" {
  interface Assertion<T> {
    toHaveRegisteredTool(name: string): T;
  }

  interface AsymmetricMatchersContaining {
    toHaveRegisteredTool(name: string): void;
  }
}
