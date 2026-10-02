import {
  constants,
  access as fsAccess,
  readFile as fsReadFile,
  lstat,
} from "node:fs/promises";
import { resolve } from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ReadToolDetails,
} from "@earendil-works/pi-coding-agent";
import {
  createLsTool,
  createReadToolDefinition,
  getMarkdownTheme,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Markdown, Text } from "@earendil-works/pi-tui";
import { SkillDescriptionPreviewComponent } from "@harness/ui";
import { parseSkillDescription } from "@harness/utils";

/**
 * Override the built-in read tool to handle directories and markdown
 * rendering.
 *
 * - If the path is a directory, delegate to the native `ls` tool instead of
 *   throwing EISDIR.
 * - Markdown files (`.md`, `.markdown`) are rendered as formatted markdown
 *   (headings, lists, code blocks, links) when expanded and non-error. All
 *   other cases delegate to the native read renderer, so non-markdown files
 *   keep byte-for-byte native behavior.
 * - Collapsed `SKILL.md` reads preview the parsed frontmatter description
 *   beneath the call line; the native renderer only shows the directory name.
 */
export default function (pi: ExtensionAPI): void {
  const cwd = process.cwd();
  const nativeDef = createNativeReadTool(cwd);
  const mdTheme = getMarkdownTheme();

  pi.registerTool({
    ...nativeDef,
    annotations: { readOnlyHint: true, openWorldHint: false },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { path } = params;
      const absolutePath = resolve(ctx.cwd, path);
      const scopedNativeDef = createNativeReadTool(ctx.cwd);
      const scopedNativeLs = createLsTool(ctx.cwd);

      try {
        const stat = await lstat(absolutePath);

        if (stat.isDirectory()) {
          return scopedNativeLs.execute(toolCallId, { path }, signal, onUpdate);
        }
      } catch (_error) {
        void _error;
        // Path does not exist or cannot be accessed - let nativeDef handle the error
      }

      return scopedNativeDef.execute(toolCallId, params, signal, onUpdate, ctx);
    },
    renderResult(result, options, theme, context) {
      const rawPath = strPath(context.args?.path);
      const isMarkdown = isMarkdownPath(rawPath);
      const expanded = options.expanded;
      const isError = context.isError;

      // Collapsed SKILL.md: preview the parsed frontmatter description instead
      // of the native empty line, so the skill's purpose shows without expanding.
      if (!expanded && !isError && isSkillPath(rawPath)) {
        const description = parseSkillDescription(readTextOutput(result));
        if (description) {
          const existing = context.lastComponent;
          if (existing instanceof SkillDescriptionPreviewComponent) {
            existing.setDescription(description);
            return existing;
          }
          return new SkillDescriptionPreviewComponent(theme, description, true);
        }
      }

      if (isMarkdown && expanded && !isError) {
        // Render the file text as formatted markdown instead of highlighted source.
        const text = readTextOutput(result);
        const existing = context.lastComponent;
        if (existing instanceof Markdown) {
          existing.setText(text);
          return existing;
        }
        return new Markdown(text, 0, 0, mdTheme);
      }

      // Delegate everything else to the native read renderer. Never hand the
      // native renderer a non-Text lastComponent: it casts lastComponent to
      // Text and calls setText, which would double-process a Markdown instance.
      const lastComponent =
        context.lastComponent instanceof Text
          ? context.lastComponent
          : undefined;
      const nativeCtx =
        lastComponent === context.lastComponent
          ? context
          : { ...context, lastComponent };
      return (
        nativeDef.renderResult?.(
          result as AgentToolResult<ReadToolDetails | undefined>,
          options,
          theme,
          nativeCtx,
        ) ?? new Text("", 0, 0)
      );
    },
  });
}

function createNativeReadTool(cwd: string) {
  const autoResizeImages = SettingsManager.create(cwd).getImageAutoResize();

  return createReadToolDefinition(cwd, {
    autoResizeImages,
    operations: {
      access: (absolutePath) => fsAccess(absolutePath, constants.R_OK),
      readFile: (absolutePath) => fsReadFile(absolutePath),
    },
  });
}

function isMarkdownPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "md" || ext === "markdown";
}

export function isSkillPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1]?.toLowerCase() === "skill.md";
}

function strPath(value: unknown): string | null {
  if (typeof value === "string") return value;
  return null;
}

function readTextOutput(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}
