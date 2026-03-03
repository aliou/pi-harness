import { DynamicBorder, type Theme } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";

export interface ActivePlanWidgetState {
  title: string;
  filename: string;
}

export const PLAN_EXECUTION_ENTRY_TYPE = "plan-execution-state";

export function createPlanExecutionWidget(state: ActivePlanWidgetState) {
  return (_tui: unknown, theme: Theme) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("muted", s)));
    const header = theme.fg(
      "accent",
      theme.bold(`Executing Plan: ${state.title}`),
    );
    const fileLine = theme.fg("dim", `File: ${state.filename}`);
    container.addChild(new Text(`${header}\n${fileLine}`, 1, 0));
    return container;
  };
}
