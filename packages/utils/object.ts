type DefinedKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

type UndefinableKeys<T> = Exclude<keyof T, DefinedKeys<T>>;

/**
 * `T` with every key that may hold `undefined` turned into an optional key
 * that never holds it.
 */
export type WithoutUndefined<T> = {
  [K in DefinedKeys<T>]: T[K];
} & {
  [K in UndefinableKeys<T>]?: Exclude<T[K], undefined>;
};

/**
 * Copy `value` without its `undefined` fields, keeping key order. Tool
 * `structuredContent` must be JSON, which has no `undefined`.
 */
export function withoutUndefined<T extends object>(
  value: T,
): WithoutUndefined<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as WithoutUndefined<T>;
}
