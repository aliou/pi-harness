/**
 * Oracle tools stay disabled for the gpt-5.6 and gpt-6 model families.
 *
 * Prefix match on the model id -- no hardcoded variant list -- so future
 * releases in the same families (gpt-6.1, gpt-6-anything) match too.
 */
export function disablesOracleTools(
  model: { provider: string; id: string } | undefined,
): boolean {
  if (!model) return false;
  const id = model.id.toLowerCase();
  return id.startsWith("gpt-5.6") || id.startsWith("gpt-6");
}
