/**
 * `?` skill directory autocomplete provider.
 *
 * On `?<token>` or `??` in the input editor (at a token boundary),
 * suggests skill directories from configurable root paths. `??` forces
 * the full list without a filter. Accepting a completion leaves a compact
 * inline reference. On submission, every known reference becomes a separate
 * skill context message while the skill name remains in the user's prose.
 *
 * The root paths are configured in the completion config file
 * (`$PI_CODING_AGENT_DIR/settings/completion.json`):
 * ```json
 * {
 *   "skillsRoots": [
 *     { "path": "~/skills", "label": "personal" },
 *     { "path": "~/code/src/skill-library", "label": "library" }
 *   ]
 * }
 * ```
 * Each entry is an object with a required `path` and `label`. The label is
 * shown as a `[label]` prefix on each skill's description, mirroring pi's
 * source tagging. Any other shape (bare strings, missing fields) fails loudly.
 *
 * `pinned` is an optional array of skill directory paths loaded regardless of
 * the roots. Pinned skills are contributed to pi's resource manager via the
 * `resources_discover` event so pi loads them as real skills, win name
 * collisions against roots in the `?` completion, and their missing paths are
 * reported on session start.
 *
 * If the config file doesn't exist or any configured path doesn't exist,
 * a notification is shown on session start. The provider is still registered
 * with whatever valid roots exist.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  getCompletionConfigPath,
  type ResolvedPinnedSkills,
  type ResolvedSkillsRoots,
  resolvePinnedSkills,
  resolveSkillsRoots,
} from "./config";
import { expandSkillReferences } from "./expand";
import { createSkillAutocompleteProvider } from "./provider";
import { renderSkillInvocation, SKILL_INVOCATION_MESSAGE_TYPE } from "./render";
import {
  listSkills,
  loadPinnedSkills,
  type SkillInfo,
  type SkillsRoot,
} from "./skills";

/** Source label shown for pinned skills in the `?` completion. */
const PINNED_LABEL = "pin";

export default async function (pi: ExtensionAPI) {
  let skillsRoots: SkillsRoot[] = [];
  let pinnedSkills: SkillInfo[] = [];
  let resolvedPinned: ResolvedPinnedSkills = { valid: [], missing: [] };
  let pinnedConfigError: string | undefined;

  try {
    resolvedPinned = resolvePinnedSkills();
    pinnedSkills = loadPinnedSkills(resolvedPinned.valid, PINNED_LABEL);
  } catch (error) {
    pinnedConfigError = error instanceof Error ? error.message : String(error);
  }

  // Pinned skills from the completion config are contributed as real skills
  // so pi's resource manager loads them on startup and `/reload`.
  pi.on("resources_discover", () => ({
    skillPaths: pinnedSkills.map((skill) => skill.fullPath),
  }));

  pi.registerMessageRenderer(
    SKILL_INVOCATION_MESSAGE_TYPE,
    renderSkillInvocation,
  );

  pi.on("input", (event, ctx) => {
    if (skillsRoots.length === 0 && pinnedSkills.length === 0) {
      return { action: "continue" };
    }

    try {
      const result = expandSkillReferences(
        event.text,
        listSkills(skillsRoots, pinnedSkills),
      );
      if (result.skills.length === 0) return { action: "continue" };

      const deliveryOptions = event.streamingBehavior
        ? { deliverAs: event.streamingBehavior }
        : undefined;
      for (const skill of result.skills) {
        pi.sendMessage(
          {
            customType: SKILL_INVOCATION_MESSAGE_TYPE,
            content: skill.xml,
            display: true,
            details: {
              name: skill.name,
              path: skill.path,
              description: skill.description,
            },
          },
          deliveryOptions,
        );
      }

      return { action: "transform", text: result.prose };
    } catch (error) {
      ctx.ui.notify(
        `Skill expansion failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      return { action: "continue" };
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    let resolvedRoots: ResolvedSkillsRoots = { valid: [], missing: [] };
    try {
      resolvedRoots = resolveSkillsRoots();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(
        `Skill autocomplete disabled — invalid config in ${getCompletionConfigPath()}: ${message}`,
        "error",
      );
    }

    if (pinnedConfigError) {
      ctx.ui.notify(
        `Pinned skills disabled — invalid config in ${getCompletionConfigPath()}: ${pinnedConfigError}`,
        "error",
      );
    }

    skillsRoots = resolvedRoots.valid;

    if (
      skillsRoots.length === 0 &&
      resolvedRoots.missing.length === 0 &&
      pinnedSkills.length === 0 &&
      resolvedPinned.missing.length === 0
    ) {
      ctx.ui.notify(
        `Skill autocomplete not configured. Set skillsRoots in ${getCompletionConfigPath()}`,
        "warning",
      );
      return;
    }

    const missing = [...resolvedRoots.missing, ...resolvedPinned.missing];
    if (missing.length > 0) {
      ctx.ui.notify(
        `Skill autocomplete: missing directories: ${missing.join(", ")}`,
        "warning",
      );
    }

    if (skillsRoots.length === 0 && pinnedSkills.length === 0) return;

    ctx.ui.addAutocompleteProvider((current) =>
      createSkillAutocompleteProvider(current, skillsRoots, pinnedSkills),
    );
  });
}
