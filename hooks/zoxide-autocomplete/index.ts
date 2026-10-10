/**
 * `@z:` zoxide autocomplete provider.
 *
 * On `@z:<token>` in the input editor, suggests entries from the full zoxide
 * database. Accepting a completion replaces the full `@z:<token>` prefix
 * with the path (tilde form under $HOME).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createProjectAutocompleteProvider } from "./provider";

export default async function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.addAutocompleteProvider((current) =>
      createProjectAutocompleteProvider(current, pi),
    );
  });
}
