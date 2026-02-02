import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { VERSION } from "@mariozechner/pi-coding-agent";

const NPM_REGISTRY_URL =
  "https://registry.npmjs.org/@mariozechner/pi-coding-agent/latest";

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(NPM_REGISTRY_URL);
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

const UPDATE_PROMPT = `# Update Pi Extensions

Update this project's Pi extensions, themes, and components to the specified target Pi version.

## Steps

### 1. Detect Package Manager

Use \`detect_package_manager\` to identify the package manager (npm, pnpm, yarn, bun). Use its install and run commands for all subsequent steps.

### 2. Version Check

The target Pi version is provided above. Read \`./package.json\` to find the current Pi package versions. The relevant packages are any of:
- \`@mariozechner/pi-ai\`
- \`@mariozechner/pi-coding-agent\`
- \`@mariozechner/pi-tui\`
- \`@mariozechner/pi-agent-core\`

Report the current version in package.json vs the target version. If versions match, stop here -- nothing to update.

### 3. Gather Documentation

If there's a version mismatch:
1. Use \`pi_changelog\` to get changelog entries for versions between current and target
2. Use \`pi_docs\` to get paths to Pi documentation
3. Read the relevant docs, especially:
   - \`docs/extensions.md\` for extension API changes
   - Any migration guides or breaking changes noted in changelogs

### 4. Analyze Source

Scan all source files that import from Pi packages:
1. Find all \`.ts\` and \`.tsx\` files that import from \`@mariozechner/pi-*\`
2. For each file, identify API usage that needs updating based on changelog/docs
3. Note deprecated patterns or new recommended approaches
4. Look for custom utility functions that duplicate functionality now available in the Pi SDK -- if the SDK provides an equivalent, flag it for replacement

### 5. Create Update Plan

Present a detailed plan:
- Package version updates needed (in root and any sub-package.json files with peerDependencies)
- For each affected file:
  - Specific API migrations required
  - Breaking changes and how to address them
- New features from the changelog that could improve existing code
- Custom utilities replaceable by SDK exports

### 6. User Confirmation

Present the plan and ask for confirmation before proceeding. Wait for feedback. Iterate on the plan based on user input until agreement is reached.

### 7. Execute Updates

Once confirmed:
1. Update Pi package versions in \`./package.json\` and any sub-package files (peerDependencies) to the exact target version. Use exact versions (e.g., \`0.51.0\`), not ranges.
2. Apply the planned code changes
3. Run the install command from step 1
4. Run typecheck (\`tsc --build\` or the project's typecheck script)
5. Run lint if the project has a lint script
6. Report results and any issues encountered

### 8. Commit Changes

After successful verification:
1. Check \`git status\` to see all changed files
2. Stage only files changed by this update -- do not use \`git add .\`
3. Commit with message format: \`chore: update pi packages to X.Y.Z\`
4. Include a brief summary of breaking changes addressed in the commit body

## Fallback

If the extension tools (\`pi_changelog\`, \`pi_docs\`, \`detect_package_manager\`) fail -- which can happen when the very update being applied changes the tool calling convention -- fall back to:
- Changelog: read \`CHANGELOG.md\` from the Pi installation directory
- Docs: read \`README.md\` and list \`docs/\` from the Pi installation directory
- Package manager: check for lockfiles manually (\`pnpm-lock.yaml\`, \`yarn.lock\`, \`package-lock.json\`, \`bun.lockb\`)

## Important

- Preserve existing functionality while updating to new APIs
- Keep changes minimal and focused on API compatibility
- If unsure about a migration, ask for clarification`;

export function registerUpdateCommand(pi: ExtensionAPI) {
  pi.registerCommand("extensions:update", {
    description: "Update Pi extensions to a target version (current or latest)",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      let targetVersion: string;

      if (args?.trim()) {
        // Version passed as argument.
        targetVersion = args.trim().replace(/^v/, "");
      } else {
        // Fetch latest and let user choose.
        ctx.ui.setStatus("extensions:update", "Checking latest version...");
        const latest = await fetchLatestVersion();
        ctx.ui.setStatus("extensions:update", undefined);

        if (!latest || latest === VERSION) {
          // Either fetch failed or already on latest -- use installed version.
          targetVersion = VERSION;
          if (!latest) {
            ctx.ui.notify(
              "Could not fetch latest version from npm, using installed version.",
              "warning",
            );
          }
        } else {
          const choice = await ctx.ui.select(
            `Installed: ${VERSION}, Latest: ${latest}`,
            [`${latest} (latest)`, `${VERSION} (installed)`],
          );

          if (choice === undefined) return; // cancelled

          targetVersion = choice.startsWith(latest) ? latest : VERSION;
        }
      }

      pi.sendUserMessage(
        `Target Pi version: ${targetVersion}\n\n${UPDATE_PROMPT}`,
      );
    },
  });
}
