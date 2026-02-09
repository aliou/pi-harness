export interface PromptSection {
  /** Tab label shown in the viewer. */
  label: string;
  /** Full file path (for AGENTS.md sections). */
  path?: string;
  /** The raw text content of this section. */
  content: string;
}

/**
 * Header pattern used for AGENTS.md / CLAUDE.md context files.
 * The system prompt assembles them as:
 *
 *   ## /path/to/AGENTS.md
 *
 *   <content>
 */
const CONTEXT_HEADER_RE = /^## (\/\S+)/gm;

/**
 * The "# Project Context" header and intro text that separates
 * the base prompt from context files.
 */
const PROJECT_CONTEXT_RE =
  /\n*# Project Context\n+Project-specific instructions and guidelines:\n*/;

/**
 * Metadata appended by pi: current date/time and cwd.
 * May appear at the end of the base prompt (before extension additions).
 */
const META_RE = /\n*Current date and time:.*\nCurrent working directory:.*\n*/g;

/**
 * Split the system prompt into sections:
 *   1. "Base" - everything before "# Project Context"
 *   2. One section per AGENTS.md / CLAUDE.md file
 *   3. "Extensions" - guidance injected after the base prompt
 */
export function parsePromptSections(
  currentPrompt: string,
  basePrompt: string | undefined,
): PromptSection[] {
  // Strip date/time and cwd metadata.
  const prompt = currentPrompt.replace(META_RE, "\n").trimEnd();
  const base = basePrompt?.replace(META_RE, "\n").trimEnd();

  const sections: PromptSection[] = [];

  // Split on "# Project Context" to isolate the base.
  const contextSplit = prompt.split(PROJECT_CONTEXT_RE);
  const baseContent = (contextSplit[0] ?? "").trimEnd();
  const afterContext = contextSplit[1] ?? "";

  if (baseContent) {
    sections.push({ label: "Base", content: baseContent });
  }

  // If there's no content after the project context header,
  // check for extension additions and return.
  if (!afterContext) {
    appendExtensionsSection(sections, prompt, base);
    return sections;
  }

  // Find all context file headers in the post-context portion.
  const headers: Array<{ path: string; start: number; headerEnd: number }> = [];
  for (const match of afterContext.matchAll(CONTEXT_HEADER_RE)) {
    headers.push({
      path: match[1] as string,
      start: match.index as number,
      headerEnd: (match.index as number) + match[0].length,
    });
  }

  if (headers.length === 0) {
    // No file headers found but there is content after the project context.
    sections.push({ label: "Context", content: afterContext.trim() });
    appendExtensionsSection(sections, prompt, base);
    return sections;
  }

  // Each context file header becomes a section.
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (!header) continue;
    const nextStart =
      i + 1 < headers.length ? headers[i + 1]?.start : undefined;

    let sectionContent: string;
    if (nextStart !== undefined) {
      sectionContent = afterContext.slice(header.headerEnd, nextStart);
    } else {
      sectionContent = afterContext.slice(header.headerEnd);
    }

    // Short label from path.
    const pathParts = header.path.split("/");
    const fileName = pathParts.pop() ?? header.path;
    const parentDir = pathParts.pop();
    const label = parentDir ? `${parentDir}/${fileName}` : fileName;

    sections.push({
      label,
      path: header.path,
      content: sectionContent.trim(),
    });
  }

  appendExtensionsSection(sections, prompt, base);
  return sections;
}

function appendExtensionsSection(
  sections: PromptSection[],
  currentPrompt: string,
  basePrompt: string | undefined,
): void {
  if (!basePrompt || currentPrompt.length <= basePrompt.length) return;

  const extra = currentPrompt.slice(basePrompt.length).trim();
  if (extra) {
    sections.push({ label: "Extensions", content: extra });
  }
}
