/**
 * Cross-provider model aliases as virtual models.
 *
 * Each entry in `table.ts` becomes a selectable `alias/<id>` model that routes
 * to the same model on different providers (neuralwatt, synthetic, ...). The
 * first available target wins and stays sticky for the session: Pi stores the
 * pick as router state on the session branch, so it survives resume,
 * compaction, and forks. Retries stick to the failed provider.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type AliasState, createAliasRoute } from "./route";
import { ALIAS_PROVIDER, ALIASES, type AliasDefinition } from "./table";

const THINKING_LEVELS = ["low", "medium", "high", "xhigh"] as const;

function registerAlias(pi: ExtensionAPI, definition: AliasDefinition): void {
  const route = createAliasRoute(definition);
  pi.registerVirtualModel<AliasState>({
    provider: ALIAS_PROVIDER,
    id: definition.id,
    name: definition.name,
    thinkingLevels: [...THINKING_LEVELS],
    // No contextWindow/maxTokens: the target is only known once routed, and
    // Pi uses the routed model's limits for requests and compaction.
    route: (request, ctx) => route(request, ctx.modelRegistry),
  });
}

export default function (pi: ExtensionAPI) {
  for (const definition of ALIASES) {
    registerAlias(pi, definition);
  }
}
