import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

interface AutoThemeState {
  intervalId: ReturnType<typeof setInterval> | null;
  currentTheme: "dark" | "light" | null;
  initialized: boolean;
  inFlight: Promise<void> | null;
}

export function setupAutoThemeHook(pi: ExtensionAPI) {
  // macOS only
  if (process.platform !== "darwin") {
    return;
  }

  const state: AutoThemeState = {
    intervalId: null,
    currentTheme: null,
    initialized: false,
    inFlight: null,
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

  // Detect system theme and sync UI
  async function syncThemeFromSystem(ctx: ExtensionContext) {
    const dark = await isDarkMode();
    const theme = dark ? "dark" : "light";

    // First run: sync silently without notification
    if (!state.initialized) {
      await ctx.ui.setTheme(theme);
      state.currentTheme = theme;
      state.initialized = true;
      return;
    }

    // Subsequent runs: only notify if theme actually changed
    if (state.currentTheme !== theme) {
      await ctx.ui.setTheme(theme);
      state.currentTheme = theme;
      ctx.ui.notify(`Theme changed to ${theme} mode`, "info");
    }
  }

  // Apply theme with serialization to prevent overlapping execution
  async function applyTheme(ctx: ExtensionContext) {
    if (state.inFlight) {
      return state.inFlight;
    }

    state.inFlight = syncThemeFromSystem(ctx).finally(() => {
      state.inFlight = null;
    });

    return state.inFlight;
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
