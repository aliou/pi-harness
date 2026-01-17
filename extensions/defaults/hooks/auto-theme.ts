import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

interface AutoThemeState {
  intervalId: ReturnType<typeof setInterval> | null;
  currentTheme: "dark" | "light" | null;
}

export function setupAutoThemeHook(pi: ExtensionAPI) {
  // macOS only
  if (process.platform !== "darwin") {
    return;
  }

  const state: AutoThemeState = {
    intervalId: null,
    currentTheme: null,
  };

  // macOS system appearance detection
  async function isDarkMode(): Promise<boolean> {
    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);

      const { stdout } = await execAsync(
        "osascript -e 'tell application \"System Events\" to tell appearance preferences to return dark mode'",
      );
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  }

  // Apply theme based on system appearance
  async function applyTheme(ctx: ExtensionContext) {
    const dark = await isDarkMode();
    const theme = dark ? "dark" : "light";

    // Only notify if theme actually changed
    if (state.currentTheme !== theme) {
      state.currentTheme = theme;
      ctx.ui.setTheme(theme);
      ctx.ui.notify(`Theme changed to ${theme} mode`, "info");
    }
  }

  // Start monitoring on session start
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Initial theme set - not awaited to avoid blocking session start
    applyTheme(ctx).catch((error) => {
      ctx.ui.notify(
        `Failed to apply theme: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    });

    // Poll every 2 seconds for system changes
    state.intervalId = setInterval(() => {
      applyTheme(ctx).catch((error) => {
        ctx.ui.notify(
          `Failed to apply theme: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      });
    }, 2000);
  });

  // Stop monitoring on session shutdown
  pi.on("session_shutdown", () => {
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
  });

  // Also handle session switch
  pi.on("session_switch", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    // Not awaited to avoid blocking session switch
    applyTheme(ctx).catch((error) => {
      ctx.ui.notify(
        `Failed to apply theme: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    });
  });
}
