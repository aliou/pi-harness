import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "extensions/**/*.test.ts",
      "integrations/**/*.test.ts",
      "packages/**/*.test.ts",
    ],
    setupFiles: ["./tests/vitest.setup.ts"],
    mockReset: true,
  },
});
