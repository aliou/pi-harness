import {
  type BranchEntryLike,
  effectiveModelIdentity,
  knownModelFamily,
  type ModelIdentity,
} from "@harness/models";

/** Advisory subagent tools stay unavailable for the GPT-5.6 and GPT-6 families. */
export function disablesAdvisoryTools(
  model: { provider: string; id: string } | undefined,
): boolean {
  if (!model) return false;
  return (
    knownModelFamily(model) === "gpt-6" || /^gpt-5\.6(?:-|$)/i.test(model.id)
  );
}

/**
 * Error message when the calling model's family does not support the advisory
 * tools, or undefined when the call may proceed. The tools stay registered for
 * every model: a visibility gate under a virtual (alias) selection can apply
 * after the caller has already discovered the tool, so gated families fail the
 * call with an explanation instead.
 */
export function advisoryUnavailableReason(
  model: (ModelIdentity & { api?: string }) | undefined,
  branch: readonly BranchEntryLike[],
): string | undefined {
  const identity = effectiveModelIdentity(model, branch);
  if (!identity || !disablesAdvisoryTools(identity)) return undefined;
  return `advisor and oracle are not available for ${identity.provider}/${identity.id}: this model family has native advisory capabilities.`;
}
