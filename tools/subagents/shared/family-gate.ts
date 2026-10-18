import { knownModelFamily } from "@harness/models";

/** Advisory subagent tools stay disabled for the GPT-5.6 and GPT-6 families. */
export function disablesAdvisoryTools(
  model: { provider: string; id: string } | undefined,
): boolean {
  if (!model) return false;
  return (
    knownModelFamily(model) === "gpt-6" || /^gpt-5\.6(?:-|$)/i.test(model.id)
  );
}

/**
 * Advisory gate decided from a virtual (alias) selection's id alone, before
 * the alias has routed on this branch. pi-rig's `latest/*` and `fast/*` gpt
 * aliases only match GPT-5/6 deployments, which the family gate disables.
 * Mixed rosters (`agents/*`) and unknown providers return undefined; the
 * routed-model decision applies once routing state exists.
 */
export function aliasDisablesAdvisoryTools(
  model: { provider?: string; id?: string } | undefined,
): boolean | undefined {
  const provider = model?.provider;
  if (provider !== "latest" && provider !== "fast") return undefined;
  const id = model?.id?.toLowerCase() ?? "";
  if (id.startsWith("gpt-")) return true;
  return false;
}
