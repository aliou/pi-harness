/**
 * Returns the active tool list with `names` appended, or undefined when every
 * name is already active.
 */
export function addTools(
  active: readonly string[],
  names: readonly string[],
): string[] | undefined {
  const missing = names.filter((name) => !active.includes(name));
  return missing.length > 0 ? [...active, ...missing] : undefined;
}

/**
 * Returns the active tool list without `names`, or undefined when none of the
 * names were active.
 */
export function removeTools(
  active: readonly string[],
  names: readonly string[],
): string[] | undefined {
  const next = active.filter((name) => !names.includes(name));
  return next.length === active.length ? undefined : next;
}
