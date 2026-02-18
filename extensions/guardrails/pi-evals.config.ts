import { defineConfig } from "@aliou/pi-evals";

export default defineConfig({
  defaults: {
    model: "gpt-4o",
    provider: "github-models",
    extensions: ["./index.ts"],
  },
  evalsDir: "./evals",
  delayBetweenTests: 1000,
  timeout: 30_000,
});
