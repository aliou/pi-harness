import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Internal pi-coding-agent module not exposed via package "exports".
      // Mapped here so tests can import it; the single wrapper in
      // packages/test-utils/load-extension.ts is the only consumer.
      "#pi-internal/extensions-loader": resolve(
        "node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js",
      ),
    },
  },
  test: {
    environment: "node",
    exclude: ["evals/**", "**/*.eval.ts"],
    include: [
      "commands/**/*.test.ts",
      "hooks/**/*.test.ts",
      "packages/**/*.test.ts",
      "providers/**/*.test.ts",
      "tools/**/*.test.ts",
    ],
    setupFiles: ["./tests/vitest.setup.ts"],
    mockReset: true,
  },
});
