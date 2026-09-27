/** Shared worker-backed Sesame search client lifecycle. */

import { AsyncSessionSearch, getXDGPaths } from "@aliou/sesame";

let client: AsyncSessionSearch | null = null;

/** Lazily start Sesame's worker. SQLite stays inside the library. */
export function getSearchClient(): AsyncSessionSearch {
  if (!client) {
    const dataHome =
      process.env.HARNESS_DATA_HOME ||
      process.env.SESAME_DATA_DIR ||
      getXDGPaths().data;
    client = new AsyncSessionSearch(dataHome);
  }
  return client;
}

export async function dispose(): Promise<void> {
  const previous = client;
  client = null;
  await previous?.close();
}

export async function resetConnection(): Promise<void> {
  await dispose();
}
