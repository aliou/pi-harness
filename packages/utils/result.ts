/** Success or failure result, matching the shape pi-agent-core used to export. */
export type Result<TValue, TError = Error> =
  | { ok: true; value: TValue }
  | { ok: false; error: TError };

/** Create a successful Result. */
export function ok<TValue, TError = never>(
  value: TValue,
): Result<TValue, TError> {
  return { ok: true, value };
}

/** Create a failed Result. */
export function err<TValue = never, TError = Error>(
  error: TError,
): Result<TValue, TError> {
  return { ok: false, error };
}

/** Narrow a Result to its success variant. */
export function isOk<TValue, TError>(
  result: Result<TValue, TError>,
): result is { ok: true; value: TValue } {
  return result.ok;
}

/** Narrow a Result to its failure variant. */
export function isErr<TValue, TError>(
  result: Result<TValue, TError>,
): result is { ok: false; error: TError } {
  return !result.ok;
}

/** Unwrap a successful Result, throwing the error of a failed one. */
export function getOrThrow<TValue, TError>(
  result: Result<TValue, TError>,
): TValue {
  if (result.ok) return result.value;
  throw result.error;
}

/** Unwrap a successful Result, returning undefined for a failed one. */
export function getOrUndefined<TValue, TError>(
  result: Result<TValue, TError>,
): TValue | undefined {
  return result.ok ? result.value : undefined;
}

/** Convert an unknown thrown value to an Error. */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(String(value));
}
