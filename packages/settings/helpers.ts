/**
 * Shared helpers for settings management.
 */

/**
 * Set a deeply nested value on an object using a dotted path.
 * Creates intermediate objects as needed.
 *
 * Example: setNestedValue(obj, "features.debug", true)
 * sets obj.features.debug = true, creating obj.features if needed.
 */
export function setNestedValue(
  obj: object,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  // biome-ignore lint/suspicious/noExplicitAny: dynamic path traversal
  let target: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i] as string;
    if (!target[key] || typeof target[key] !== "object") target[key] = {};
    target = target[key];
  }
  target[parts[parts.length - 1] as string] = value;
}

/**
 * Get a deeply nested value from an object using a dotted path.
 * Returns undefined if any intermediate key is missing.
 */
export function getNestedValue(obj: object, path: string): unknown {
  const parts = path.split(".");
  // biome-ignore lint/suspicious/noExplicitAny: dynamic path traversal
  let target: any = obj;
  for (const part of parts) {
    if (target == null) return undefined;
    target = target[part];
  }
  return target;
}

/**
 * Map a UI display value to its storage representation.
 *
 * "enabled" / "on"  -> true
 * "disabled" / "off" -> false
 * anything else      -> the string as-is (for enums like "pnpm")
 */
export function displayToStorageValue(displayValue: string): unknown {
  switch (displayValue) {
    case "enabled":
    case "on":
      return true;
    case "disabled":
    case "off":
      return false;
    default:
      return displayValue;
  }
}
