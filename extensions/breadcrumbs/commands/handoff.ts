/**
 * Handoff command - /handoff [goal]
 *
 * Creates a new session with extracted context from the current session.
 * The goal guides what context to extract. Shows streaming extraction
 * progress that can be toggled with Ctrl+O.
 */

import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import {
  Container,
  Loader,
  matchesKey,
  Spacer,
  Text,
  type TUI,
} from "@mariozechner/pi-tui";
import type { ExtractedHandoffContext } from "../lib/handoff";
import { extractHandoffContext } from "../lib/handoff";
import {
  writeSessionLinkMarker,
  writeSessionLinkSource,
} from "../lib/session-link";

/**
 * Max characters to keep in the streaming buffer to avoid unbounded growth.
 */
const MAX_STREAM_BUFFER = 20_000;

/**
 * Custom component that shows a bordered loader with expandable streaming text.
 * Collapsed: spinner + hint. Expanded: spinner + streaming extraction output.
 * Toggle with Ctrl+O, cancel with Esc.
 */
class HandoffExtractionView extends Container {
  private expanded = false;
  private streamBuffer = "";
  private loader: Loader;
  private borderTop: DynamicBorder;
  private borderBottom: DynamicBorder;
  private streamText: Text;
  private hintText: Text;

  /** Called when the user presses Esc. Set by the factory. */
  onCancel: (() => void) | undefined;

  constructor(tui: TUI, theme: Theme) {
    super();

    const borderColor = (s: string) => theme.fg("border", s);
    this.borderTop = new DynamicBorder(borderColor);
    this.borderBottom = new DynamicBorder(borderColor);

    this.loader = new Loader(
      tui,
      (s: string) => theme.fg("accent", s),
      (s: string) => theme.fg("muted", s),
      "Extracting handoff context...",
    );
    this.loader.start();

    this.streamText = new Text("", 1, 0);
    this.hintText = new Text(
      theme.fg("dim", "  Ctrl+O to expand | Esc to cancel"),
      0,
      0,
    );

    this.rebuild();
  }

  private rebuild() {
    this.clear();
    this.addChild(this.borderTop);
    this.addChild(this.loader);

    this.addChild(new Spacer(1));

    if (this.expanded && this.streamBuffer) {
      this.addChild(this.streamText);
    } else {
      this.addChild(this.hintText);
    }

    this.addChild(new Spacer(1));
    this.addChild(this.borderBottom);
  }

  handleInput(data: string) {
    if (matchesKey(data, "escape")) {
      this.onCancel?.();
      return;
    }
    if (matchesKey(data, "ctrl+o")) {
      this.toggleExpanded();
      return;
    }
  }

  toggleExpanded() {
    this.expanded = !this.expanded;
    this.rebuild();
    this.invalidate();
  }

  appendText(chunk: string) {
    this.streamBuffer += chunk;
    if (this.streamBuffer.length > MAX_STREAM_BUFFER) {
      this.streamBuffer = this.streamBuffer.slice(-MAX_STREAM_BUFFER);
    }
    this.streamText.setText(this.streamBuffer);
    if (this.expanded) {
      this.invalidate();
    }
  }

  finish(message: string) {
    this.loader.stop();
    this.loader.setMessage(message);
    this.rebuild();
    this.invalidate();
  }

  dispose() {
    this.loader.stop();
  }
}

export function setupHandoffCommand(pi: ExtensionAPI) {
  pi.registerCommand("handoff", {
    description: "Create a new session with context from the current session",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("handoff requires interactive mode", "error");
        return;
      }

      if (!ctx.model) {
        ctx.ui.notify("No model selected", "error");
        return;
      }

      // If no goal provided, prompt the user for one
      let goal = args.trim();
      if (!goal) {
        const input = await ctx.ui.input(
          "Handoff goal",
          "e.g. implement OAuth support for Linear API",
        );
        if (!input) {
          return; // user pressed Esc
        }
        goal = input.trim();
        if (!goal) {
          ctx.ui.notify("No goal provided", "error");
          return;
        }
      }

      const parentSessionId = ctx.sessionManager.getSessionId() ?? "unknown";
      const parentLeafId = ctx.sessionManager.getLeafId();
      const currentSessionFile = ctx.sessionManager.getSessionFile();

      if (!parentLeafId) {
        ctx.ui.notify("Failed to get parent session leaf ID", "error");
        return;
      }

      // Extract context with a streaming progress UI
      const extracted = await ctx.ui.custom<ExtractedHandoffContext | null>(
        (tui, theme, _kb, done) => {
          const view = new HandoffExtractionView(tui, theme);
          const ac = new AbortController();
          let finished = false;

          const finishOnce = (result: ExtractedHandoffContext | null) => {
            if (finished) return;
            finished = true;
            done(result);
          };

          view.onCancel = () => {
            ac.abort();
            view.finish("Cancelled.");
            finishOnce(null);
          };

          extractHandoffContext(
            goal,
            ctx,
            (delta) => {
              if (!finished) view.appendText(delta);
            },
            ac.signal,
          )
            .then((result) => {
              view.finish("Context extracted.");
              finishOnce(result);
            })
            .catch((err) => {
              const reason = err instanceof Error ? err.message : String(err);
              const isTimeout =
                reason.includes("abort") || reason.includes("timeout");
              console.error("Handoff extraction failed:", err);
              view.finish(
                isTimeout
                  ? "Extraction timed out (120s limit)."
                  : `Extraction failed: ${reason}`,
              );
              finishOnce(null);
            });

          return view;
        },
      );

      if (extracted === null) {
        // null can mean user-cancelled (Esc), timeout, or extraction error -- all logged above
        ctx.ui.notify("Handoff cancelled", "info");
        return;
      }

      const { relevantInformation, relevantFiles } = extracted;

      // Build the content for the handoff source entry
      const filesSection =
        relevantFiles.length > 0
          ? `\n\n## Relevant Files\n\n${relevantFiles.map((f) => `- ${f}`).join("\n")}`
          : "";
      const sourceContent = `Continuing from session ${parentSessionId}.\n\nThe context below is a summary. If you need more details, read the parent session:\n\nread_session({ sessionId: "${parentSessionId}", goal: "Get the last assistant message with the full plan and context" })\n\n## Context\n\n${relevantInformation}${filesSection}`;

      // Create new session with parent tracking
      const newSessionResult = await ctx.newSession({
        parentSession: currentSessionFile,
        setup: async (sm) => {
          const newSessionId = sm.getSessionId();
          if (currentSessionFile && newSessionId) {
            writeSessionLinkMarker(
              currentSessionFile,
              newSessionId,
              goal,
              "handoff",
              parentLeafId,
            );
          }
          writeSessionLinkSource(
            sm,
            parentSessionId,
            goal,
            "handoff",
            sourceContent,
          );
        },
      });

      if (newSessionResult.cancelled) {
        ctx.ui.notify("Session creation cancelled", "info");
        return;
      }

      // Set just the goal in the editor -- context is in the custom entry
      ctx.ui.setEditorText(goal);

      ctx.ui.notify("Handoff ready -- review and submit.", "info");
    },
  });
}
