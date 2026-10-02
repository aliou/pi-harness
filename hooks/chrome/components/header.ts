/**
 * Custom header showing the workspace identity line:
 * `pi [hostname] host:org/repo` (or the compact cwd when no remote exists).
 *
 * Metadata comes from the workspace-metadata hook: read from the session
 * entries on session_start, updated live via ad:workspace-metadata:captured.
 */

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { WorkspaceMetadata } from "@harness/events";
import { collapseHomePath } from "@harness/utils/path";

const LOGO = "pi";

export interface HeaderData {
  workspaceMetadata?: WorkspaceMetadata;
}

function cleanHeaderText(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatWorkspaceMetadata(
  metadata: WorkspaceMetadata | undefined,
): string | null {
  if (!metadata) return null;

  const cwd = cleanHeaderText(collapseHomePath(metadata.cwd));
  if (!cwd) return null;

  const machineHost = cleanHeaderText(metadata.hostname);
  const prefix = machineHost ? `[${machineHost}] ` : "";

  const remote =
    metadata.remotes.find(
      (remote) => cleanHeaderText(remote.name) === "origin",
    ) ?? metadata.remotes[0];

  if (!remote) return `${prefix}${cwd}`;

  const remoteHost = cleanHeaderText(remote.host);
  const repo = cleanHeaderText(remote.repo);
  if (!remoteHost || !repo) return `${prefix}${cwd}`;

  const host = remoteHost === "github.com" ? "github" : remoteHost;
  return `${prefix}${host}:${repo}`;
}

class HeaderComponent extends Container {
  constructor(
    private readonly theme: Theme,
    private readonly data: HeaderData,
  ) {
    super();
    this.rebuild();
  }

  setWorkspaceMetadata(metadata: WorkspaceMetadata | undefined) {
    this.data.workspaceMetadata = metadata;
    this.rebuild();
  }

  private rebuild() {
    const workspaceLine = formatWorkspaceMetadata(this.data.workspaceMetadata);

    this.clear();
    this.addChild(new Spacer(1));

    if (workspaceLine) {
      this.addChild(
        new Text(
          `${this.theme.fg("accent", LOGO)} ${this.theme.fg("success", workspaceLine)}`,
          1,
          0,
        ),
      );
    } else {
      this.addChild(new Text(this.theme.fg("accent", LOGO), 1, 0));
    }

    this.addChild(new Spacer(1));
  }
}

export function createCustomHeader() {
  let component: HeaderComponent | undefined;
  let currentData: HeaderData | undefined;

  return {
    setup: (ctx: ExtensionContext, data: HeaderData) => {
      if (!ctx.hasUI) return;

      currentData = data;
      ctx.ui.setHeader((_tui: unknown, theme: Theme) => {
        component = new HeaderComponent(theme, data);
        return component;
      });
    },
    setWorkspaceMetadata: (metadata: WorkspaceMetadata | undefined) => {
      if (currentData) currentData.workspaceMetadata = metadata;
      component?.setWorkspaceMetadata(metadata);
    },
    cleanup: (ctx?: ExtensionContext) => {
      component = undefined;
      currentData = undefined;
      ctx?.ui.setHeader(undefined);
    },
  };
}
