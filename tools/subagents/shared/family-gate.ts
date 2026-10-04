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
