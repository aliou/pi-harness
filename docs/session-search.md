# Session search

`@harness/session-store` adapts Sesame results for Pi tools and session references.
Sesame owns the SQLite connection and runs its synchronous queries in a worker,
so session searches do not block Pi's event loop.

```text
find_sessions / list_sessions / @@ autocomplete / @@ context
  → packages/session-store/search.ts
    → getSearchClient() in packages/session-store/db.ts
      → @aliou/sesame AsyncSessionSearch
        → Sesame worker → SQLite index
```

`getSearchClient()` creates one shared worker on first use. `HARNESS_DATA_HOME`
selects its data directory when set; otherwise Sesame uses `SESAME_DATA_DIR` or
its XDG default. The `hooks/session-store-shutdown` hook closes the worker on
Pi quit. Tool searches pass their abort signal so cancelled callers stop
waiting; a query already running on the worker finishes in the background.

Run `pnpm run typecheck`, `pnpm run lint`, and `pnpm test` from the repository
root to check this integration. `packages/session-store/search.test.ts` covers
the result mapping and browse call.
