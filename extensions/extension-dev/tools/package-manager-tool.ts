import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { resolveCtx } from "./utils";

const Params = Type.Object({});
type ParamsType = Record<string, never>;

interface PackageManagerDetails {
  success: boolean;
  message: string;
  packageManager?: string;
  version?: string;
  lockfile?: string;
  installCommand?: string;
  runCommand?: string;
  cwd?: string;
}

type ExecuteResult = AgentToolResult<PackageManagerDetails>;

const LOCKFILES: Record<string, string> = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
  "bun.lockb": "bun",
  "bun.lock": "bun",
};

const COMMANDS: Record<string, { install: string; run: string }> = {
  pnpm: { install: "pnpm install", run: "pnpm" },
  yarn: { install: "yarn install", run: "yarn" },
  npm: { install: "npm install", run: "npm run" },
  bun: { install: "bun install", run: "bun run" },
};

export function setupPackageManagerTool(pi: ExtensionAPI) {
  pi.registerTool<typeof Params, PackageManagerDetails>({
    name: "detect_package_manager",
    label: "Package Manager",
    description:
      "Detect the package manager used in the current project by checking lockfiles and package.json",

    parameters: Params,

    async execute(
      _toolCallId: string,
      _params: ParamsType,
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<ExecuteResult> {
      const resolvedCtx = resolveCtx(signal, onUpdate, ctx);
      const cwd = resolvedCtx.cwd;

      try {
        const packageJsonPath = path.join(cwd, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
          return {
            content: [
              {
                type: "text",
                text: `No package.json found in ${cwd}`,
              },
            ],
            details: {
              success: false,
              message: `No package.json found in ${cwd}`,
              cwd,
            },
          };
        }

        // Walk up from cwd to repo root, collecting packageManager and lockfile.
        // Stop at .git boundary to avoid escaping the repository.
        let declaredPm: string | undefined;
        let declaredVersion: string | undefined;
        let lockfile: string | undefined;
        let lockfilePm: string | undefined;

        let searchDir = cwd;
        while (true) {
          // Check packageManager field in package.json
          if (!declaredPm) {
            const pkgPath = path.join(searchDir, "package.json");
            try {
              if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
                if (typeof pkg.packageManager === "string") {
                  const match = pkg.packageManager.match(/^([^@]+)@?(.*)?$/);
                  if (match) {
                    declaredPm = match[1];
                    declaredVersion = match[2] || undefined;
                  }
                }
              }
            } catch {
              // Ignore parse errors
            }
          }

          // Check lockfiles
          if (!lockfilePm) {
            for (const [filename, pm] of Object.entries(LOCKFILES)) {
              if (fs.existsSync(path.join(searchDir, filename))) {
                lockfilePm = pm;
                lockfile = filename;
                break;
              }
            }
          }

          // Stop if we found both, hit .git, or hit filesystem root
          if (
            (declaredPm && lockfilePm) ||
            fs.existsSync(path.join(searchDir, ".git"))
          ) {
            break;
          }
          const parent = path.dirname(searchDir);
          if (parent === searchDir) break;
          searchDir = parent;
        }

        const pm = declaredPm || lockfilePm || "npm";
        const fallback = { install: `${pm} install`, run: pm };
        const commands = COMMANDS[pm] ?? fallback;

        const parts: string[] = [];
        parts.push(`Package manager: ${pm}`);
        if (declaredVersion) {
          parts.push(`Declared version: ${declaredVersion}`);
        }
        if (lockfile) {
          parts.push(`Lockfile: ${lockfile}`);
        }
        if (!lockfile && !declaredPm) {
          parts.push(
            "No lockfile or packageManager field found, defaulting to npm",
          );
        }
        parts.push(`Install: ${commands.install}`);
        parts.push(`Run: ${commands.run}`);

        const message = parts.join("\n");

        return {
          content: [{ type: "text", text: message }],
          details: {
            success: true,
            message,
            packageManager: pm,
            version: declaredVersion,
            lockfile,
            installCommand: commands.install,
            runCommand: commands.run,
            cwd,
          },
        };
      } catch (error) {
        const message = `Error detecting package manager: ${error instanceof Error ? error.message : String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          details: {
            success: false,
            message,
            cwd,
          },
        };
      }
    },

    renderCall(_args: ParamsType, theme: Theme): Text {
      return new Text(
        theme.fg("toolTitle", theme.bold("detect_package_manager")),
        0,
        0,
      );
    },

    renderResult(
      result: AgentToolResult<PackageManagerDetails>,
      _options: ToolRenderResultOptions,
      theme: Theme,
    ): Text {
      const { details } = result;

      if (!details) {
        const text = result.content[0];
        return new Text(
          text?.type === "text" && text.text ? text.text : "No result",
          0,
          0,
        );
      }

      if (!details.success) {
        return new Text(theme.fg("error", details.message), 0, 0);
      }

      const lines: string[] = [];
      lines.push(
        theme.fg(
          "success",
          `Package manager: ${theme.bold(details.packageManager || "unknown")}`,
        ),
      );
      if (details.version) {
        lines.push(theme.fg("dim", `Version: ${details.version}`));
      }
      if (details.lockfile) {
        lines.push(theme.fg("dim", `Lockfile: ${details.lockfile}`));
      }

      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
