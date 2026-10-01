import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCustomFooter } from "../components/footer";

export function setupFooterHook(pi: ExtensionAPI) {
  const footer = createCustomFooter(pi);

  pi.on("session_start", async (_event, ctx) => {
    footer.setup(ctx);
  });

  // The routed model shown next to an alias resets on a switch and appears
  // with the first response.
  pi.on("model_select", async () => {
    footer.refresh();
  });

  pi.on("message_end", async () => {
    footer.refresh();
  });

  pi.on("session_shutdown", async () => {
    footer.cleanup();
  });
}
