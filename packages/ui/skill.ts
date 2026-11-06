import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Box,
  Container,
  Markdown,
  type MarkdownTheme,
  MouseRegion,
  Text,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui";

export type SkillMessageTheme = Pick<
  Theme,
  "fg" | "bg" | "bold" | "italic" | "strikethrough" | "underline"
>;

export class SkillDescriptionPreviewComponent extends Text {
  constructor(
    private theme: SkillMessageTheme,
    description: string,
    private leadingNewline = false,
  ) {
    super("", 0, 0);
    this.setDescription(description);
  }

  setDescription(description: string): void {
    this.setText(
      `${this.leadingNewline ? "\n" : ""}${this.theme.fg("text", description)}`,
    );
  }
}

export interface SkillInvocationMessageOptions {
  name: string;
  content: string;
  description?: string;
  expanded: boolean;
  expandHint: string;
  theme: SkillMessageTheme;
}

export class SkillInvocationMessageComponent extends Box {
  private expanded: boolean;
  private markdownTheme: MarkdownTheme;

  constructor(private options: SkillInvocationMessageOptions) {
    super(1, 1, (text) => options.theme.bg("customMessageBg", text));
    this.expanded = options.expanded;
    this.markdownTheme = getSkillMarkdownTheme(options.theme);
    this.updateDisplay();
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    this.updateDisplay();
  }

  setOutputPad(outputPad: number): void {
    this.setPaddingX(outputPad);
  }

  override invalidate(): void {
    super.invalidate();
    this.updateDisplay();
  }

  private updateDisplay(): void {
    this.clear();
    const content = new Container();

    if (this.expanded) {
      content.addChild(
        new Text(
          this.options.theme.fg("customMessageLabel", `\x1b[1m[skill]\x1b[22m`),
          0,
          0,
        ),
      );
      const header = `**${this.options.name}**\n\n`;
      content.addChild(
        new Markdown(
          this.options.content,
          0,
          0,
          this.markdownTheme,
          {
            color: (text: string) =>
              this.options.theme.fg("customMessageText", text),
          },
          {
            transform: (markdown) => `${header}${markdown}`,
          },
        ),
      );
    } else {
      const line =
        this.options.theme.fg("customMessageLabel", `\x1b[1m[skill]\x1b[22m `) +
        this.options.theme.fg("customMessageText", this.options.name) +
        this.options.theme.fg("dim", ` (${this.options.expandHint} to expand)`);
      const description = this.options.description
        ? `\n${this.options.theme.fg("text", this.options.description)}`
        : "";
      content.addChild(new Text(`${line}${description}`, 0, 0));
    }

    this.addChild(
      new MouseRegion(content, (event: TuiMouseEvent) => {
        if (event.type !== "click" || event.button !== "left") return undefined;
        this.setExpanded(!this.expanded);
        return { handled: true };
      }),
    );
  }
}

function getSkillMarkdownTheme(theme: SkillMessageTheme): MarkdownTheme {
  return {
    heading: (text) => theme.fg("mdHeading", text),
    link: (text) => theme.fg("mdLink", text),
    linkUrl: (text) => theme.fg("mdLinkUrl", text),
    code: (text) => theme.fg("mdCode", text),
    codeBlock: (text) => theme.fg("mdCodeBlock", text),
    codeBlockBorder: (text) => theme.fg("mdCodeBlockBorder", text),
    quote: (text) => theme.fg("mdQuote", text),
    quoteBorder: (text) => theme.fg("mdQuoteBorder", text),
    hr: (text) => theme.fg("mdHr", text),
    listBullet: (text) => theme.fg("mdListBullet", text),
    bold: (text) => theme.bold(text),
    italic: (text) => theme.italic(text),
    strikethrough: (text) => theme.strikethrough(text),
    underline: (text) => theme.underline(text),
  };
}
