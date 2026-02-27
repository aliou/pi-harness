import { CustomEditor } from "@mariozechner/pi-coding-agent";
import type { ModeDefinition } from "../modes";

export class ModeEditor extends CustomEditor {
  public modeProvider?: () => ModeDefinition;

  override render(width: number): string[] {
    const lines = super.render(width);
    const mode = this.modeProvider?.();

    if (!mode || mode.name === "default" || width < 10 || lines.length === 0) {
      return lines;
    }

    const label = mode.label || mode.name;
    const prefix = "── ";
    const suffix = " ";
    const fillLen = width - prefix.length - label.length - suffix.length;
    if (fillLen < 1) return lines;

    const borderColor = this.borderColor ?? ((text: string) => text);
    const fill = "─".repeat(fillLen);

    lines[0] = `${borderColor(prefix)}${mode.labelColor(label)}${borderColor(`${suffix}${fill}`)}`;
    return lines;
  }

  requestRenderNow(): void {
    this.tui.requestRender();
  }
}
