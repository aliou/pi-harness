import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { LogStreamComponent } from "../components/log-stream-component";
import { ProcessPickerComponent } from "../components/process-picker-component";
import { ProcessesComponent } from "../components/processes-component";
import { LIVE_STATUSES, type ProcessInfo } from "../constants";
import type { ProcessManager } from "../manager";

const LOG_STREAM_WIDGET_ID = "processes-log-stream";

function processCompletions(manager: ProcessManager) {
  return (prefix: string) => {
    const processes = manager.list();
    const lower = prefix.toLowerCase();
    return processes
      .filter(
        (p) =>
          p.id.toLowerCase().startsWith(lower) ||
          p.name.toLowerCase().startsWith(lower),
      )
      .map((p) => ({
        value: p.id,
        label: p.id,
        description: p.name,
      }));
  };
}

export function setupProcessesCommands(
  pi: ExtensionAPI,
  manager: ProcessManager,
) {
  // Track whether we're currently streaming logs.
  let isStreaming = false;

  // ── /processes ──────────────────────────────────────────────────────
  pi.registerCommand("processes", {
    description: "View and manage background processes",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/processes requires interactive mode", "error");
        return;
      }

      // If currently streaming, dismiss the stream widget and show the list.
      if (isStreaming) {
        ctx.ui.setWidget(LOG_STREAM_WIDGET_ID, undefined);
        isStreaming = false;
      }

      const result = await ctx.ui.custom<string | null>(
        (tui, theme, _keybindings, done) => {
          return new ProcessesComponent(
            tui,
            theme,
            (processId?: string) => {
              if (processId) {
                done(processId);
              } else {
                done(null);
              }
            },
            manager,
          );
        },
      );

      // RPC fallback.
      if (result === undefined) {
        ctx.ui.notify("/processes requires interactive mode", "info");
        return;
      }

      // User dismissed with Escape/q.
      if (result === null) {
        return;
      }

      // User selected a process — start streaming its logs.
      startStreaming(ctx, manager, result);
    },
  });

  // ── /processes:stream [id|name] ────────────────────────────────────
  pi.registerCommand("processes:stream", {
    description: "Stream logs from a background process (no arg = dismiss)",
    getArgumentCompletions: processCompletions(manager),
    handler: async (args, ctx) => {
      const arg = args.trim();

      // No argument: dismiss the stream widget.
      if (!arg) {
        if (isStreaming) {
          ctx.ui.setWidget(LOG_STREAM_WIDGET_ID, undefined);
          isStreaming = false;
          ctx.ui.notify("Log stream dismissed", "info");
        } else {
          ctx.ui.notify("No active log stream", "info");
        }
        return;
      }

      // Try to find the process.
      const proc = manager.find(arg);
      if (proc) {
        startStreaming(ctx, manager, proc.id);
        return;
      }

      ctx.ui.notify(`Process not found: ${arg}`, "error");
    },
  });

  // ── /processes:logs [id|name] ──────────────────────────────────────
  pi.registerCommand("processes:logs", {
    description: "Show log file paths for a process",
    getArgumentCompletions: processCompletions(manager),
    handler: async (args, ctx) => {
      const arg = args.trim();

      let processId: string | undefined;

      if (arg) {
        const proc = manager.find(arg);
        if (!proc) {
          ctx.ui.notify(`Process not found: ${arg}`, "error");
          return;
        }
        processId = proc.id;
      } else {
        // No argument: show picker.
        processId = await pickProcess(ctx, "Select process for logs");
        if (!processId) return;
      }

      const logFiles = manager.getLogFiles(processId);
      const proc = manager.get(processId);
      if (!logFiles || !proc) {
        ctx.ui.notify(`Process not found: ${processId}`, "error");
        return;
      }

      ctx.ui.notify(
        `${proc.name} (${proc.id})\nstdout: ${logFiles.stdoutFile}\nstderr: ${logFiles.stderrFile}`,
        "info",
      );
    },
  });

  // ── /processes:kill [id|name] ──────────────────────────────────────
  pi.registerCommand("processes:kill", {
    description: "Kill a running background process",
    getArgumentCompletions: (prefix: string) => {
      const processes = manager.list();
      const lower = prefix.toLowerCase();
      return processes
        .filter(
          (p) =>
            LIVE_STATUSES.has(p.status) &&
            (p.id.toLowerCase().startsWith(lower) ||
              p.name.toLowerCase().startsWith(lower)),
        )
        .map((p) => ({
          value: p.id,
          label: p.id,
          description: p.name,
        }));
    },
    handler: async (args, ctx) => {
      const arg = args.trim();

      let processId: string | undefined;

      if (arg) {
        const proc = manager.find(arg);
        if (!proc) {
          ctx.ui.notify(`Process not found: ${arg}`, "error");
          return;
        }
        if (!LIVE_STATUSES.has(proc.status)) {
          ctx.ui.notify(
            `${proc.name} (${proc.id}) is not running (${proc.status})`,
            "info",
          );
          return;
        }
        processId = proc.id;
      } else {
        // No argument: show picker (only running processes).
        processId = await pickProcess(ctx, "Select process to kill", (p) =>
          LIVE_STATUSES.has(p.status),
        );
        if (!processId) return;
      }

      const proc = manager.get(processId);
      if (!proc) {
        ctx.ui.notify(`Process not found: ${processId}`, "error");
        return;
      }

      const signal =
        proc.status === "terminate_timeout" ? "SIGKILL" : "SIGTERM";
      const timeoutMs = signal === "SIGKILL" ? 200 : 3000;
      const result = await manager.kill(processId, { signal, timeoutMs });

      if (result.ok) {
        ctx.ui.notify(`Killed ${proc.name} (${proc.id})`, "info");
      } else {
        ctx.ui.notify(
          `Failed to kill ${proc.name} (${proc.id}): ${result.reason}`,
          "error",
        );
      }
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────

  function startStreaming(
    ctx: ExtensionCommandContext,
    mgr: ProcessManager,
    processId: string,
  ) {
    isStreaming = true;
    ctx.ui.setWidget(
      LOG_STREAM_WIDGET_ID,
      (tui: { requestRender: () => void }, theme: Theme) => {
        return new LogStreamComponent(tui, theme, mgr, processId);
      },
      { placement: "aboveEditor" },
    );
  }

  async function pickProcess(
    ctx: ExtensionCommandContext,
    title: string,
    filter?: (proc: ProcessInfo) => boolean,
  ): Promise<string | undefined> {
    if (!ctx.hasUI) {
      ctx.ui.notify("Interactive mode required", "error");
      return undefined;
    }

    const result = await ctx.ui.custom<string | null>(
      (tui, theme, _kb, done) => {
        return new ProcessPickerComponent(
          tui,
          theme,
          (processId?: string) => {
            done(processId ?? null);
          },
          manager,
          title,
          filter,
        );
      },
    );

    // RPC fallback or user cancelled.
    if (result === undefined || result === null) {
      return undefined;
    }

    return result;
  }
}
