import {
  VIRTUAL_MODEL_STATE_ENTRY,
  type VirtualModelStateData,
} from "@earendil-works/pi-coding-agent";
import type { ModelIdentity } from "./families";

/** `Model.api` of virtual catalog entries (Pi's `VIRTUAL_MODEL_API`, not exported). */
export const VIRTUAL_MODEL_API = "pi-virtual";

export function isVirtualModel(model: { api?: string } | undefined): boolean {
  return model?.api === VIRTUAL_MODEL_API;
}

/** The fields of a session-branch entry the resolver reads. */
export interface BranchEntryLike {
  type: string;
  customType?: string;
  data?: unknown;
}

/** Sticky pick `providers/aliases` stores as router state on the branch. */
interface AliasRouteState {
  provider: string;
  modelId: string;
}

/**
 * The model a selection effectively routes to: the selection itself when
 * physical, or, for a virtual (alias) selection, the sticky pick Pi's
 * virtual-model runtime stores on the session branch. Mirrors Pi's internal,
 * unexported `getVirtualModelState`: the latest entry matching the virtual
 * provider and model id wins, so sticky picks surviving a `model_change`
 * round trip resolve by design. Undefined when the alias never routed on this
 * branch (selected but never answered).
 */
export function effectiveModelIdentity(
  model: (ModelIdentity & { api?: string }) | undefined,
  branch: readonly BranchEntryLike[],
): ModelIdentity | undefined {
  if (!model || !isVirtualModel(model)) return model;
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (
      entry?.type !== "custom" ||
      entry.customType !== VIRTUAL_MODEL_STATE_ENTRY
    ) {
      continue;
    }
    const data = entry.data as VirtualModelStateData<AliasRouteState>;
    if (data.provider === model.provider && data.modelId === model.id) {
      return { provider: data.state.provider, id: data.state.modelId };
    }
  }
  return undefined;
}
