import { knownModelFamily } from "@harness/models";

/** Oracle tools stay disabled for the GPT-5.6 and GPT-6 model families. */
export function disablesOracleTools(
  model: { provider: string; id: string } | undefined,
): boolean {
  if (!model) return false;
  return (
    knownModelFamily(model) === "gpt-6" || /^gpt-5\.6(?:-|$)/i.test(model.id)
  );
}
