/**
 * Nix dev shell prompt builder.
 *
 * Generates a prompt that instructs the agent to create shell.nix or flake.nix
 * with a matching .envrc for direnv support.
 */

import type { ProjectStack } from "./scanner";

const ENVRC_EXTRAS = `## .envrc extras (add as needed)

- \`export DIRENV_WARN_TIMEOUT=0\` if builds are slow
- Layout blocks (\`layout node\`, \`layout bun\`) guarded by \`if has ...\`
- If this is a monorepo child, consider \`source_up\`
- If \`pi\` / \`@mariozechner/pi-coding-agent\` is in package.json, use \`layout node --deny pi\` (or \`layout bun --deny pi\`) to prevent the local pi from overriding the global one`;

const SHELL_NIX_PATTERN = `### shell.nix pattern

\`\`\`nix
{
  pkgs ? import <nixpkgs> { },
}:

pkgs.mkShell {
  buildInputs = with pkgs; [
    # Add packages for the detected stack
  ];
}
\`\`\``;

const FLAKE_NIX_PATTERN = `### flake.nix pattern

\`\`\`nix
{
  description = "dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            # Add packages for the detected stack
          ];
        };
      });
}
\`\`\``;

const REQUIREMENTS = `- Include all tools needed for the detected stack (compilers, package managers, etc.).
- The .envrc must match the nix mode:`;

const FOOTER = `If the project already has a nix file, update it to include any missing tools. Do not remove existing packages.`;

export function buildNixPrompt(
  choice: "shell.nix" | "flake.nix",
  stack: ProjectStack,
  existing: { hasShell: boolean; hasFlake: boolean },
): string {
  const hasSelected =
    (choice === "shell.nix" && existing.hasShell) ||
    (choice === "flake.nix" && existing.hasFlake);

  const hasOther =
    (choice === "shell.nix" && existing.hasFlake) ||
    (choice === "flake.nix" && existing.hasShell);

  let header: string;
  if (hasSelected) {
    header = `Please update the existing **${choice}** and matching **.envrc** for this project.`;
  } else if (hasOther) {
    header = `Please switch this project to **${choice}** by creating/updating **${choice}** and updating **.envrc** to match.`;
  } else {
    header = `Please create a new **${choice}** and a matching **.envrc** for this project.`;
  }

  const isShell = choice === "shell.nix";
  const nixSpecific = isShell
    ? `  - .envrc should contain \`use nix\`\n\n${SHELL_NIX_PATTERN}`
    : `  - .envrc should contain \`use flake\`\n\n${FLAKE_NIX_PATTERN}`;

  return `${header}

Detected stack: ${stack.summary}

## Requirements

${REQUIREMENTS}

${nixSpecific}

${ENVRC_EXTRAS}

${FOOTER}`;
}
