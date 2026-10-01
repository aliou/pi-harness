/**
 * Cross-provider virtual models: `latest/*` and `profile/*`.
 *
 * `latest/*` entries (`latest/kimi`, `latest/claude-opus`, ...) resolve a
 * model family to its newest version. `profile/*` entries (`profile/large`,
 * `profile/flash`, `profile/small`) pick a family per task shape. Each
 * definition in `table.ts` routes to the same model on different providers
 * (neuralwatt, synthetic, ...). The first available target wins and stays
 * sticky for the session: Pi stores the pick as router state on the session
 * branch, so it survives resume, compaction, and forks. Retries stick to the
 * failed provider.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createModelRoute, type RouteState } from "./route";
import { type RoutedModelDefinition, VIRTUAL_MODELS } from "./table";

const THINKING_LEVELS = ["low", "medium", "high", "xhigh"] as const;

function registerRoutedModel(
  pi: ExtensionAPI,
  definition: RoutedModelDefinition,
): void {
  const route = createModelRoute(definition);
  pi.registerVirtualModel<RouteState>({
    provider: definition.provider,
    id: definition.id,
    name: definition.name,
    thinkingLevels: [...THINKING_LEVELS],
    // No contextWindow/maxTokens: the target is only known once routed, and
    // Pi uses the routed model's limits for requests and compaction.
    route: (request, ctx) => route(request, ctx.modelRegistry),
  });
}

export default function (pi: ExtensionAPI) {
  for (const definition of VIRTUAL_MODELS) {
    registerRoutedModel(pi, definition);
  }
}
