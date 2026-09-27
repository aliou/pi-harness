import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dispose } from "@harness/session-store";

export default function (pi: ExtensionAPI): void {
  pi.on("session_shutdown", async (event) => {
    if (event.reason !== "quit") return;
    await dispose();
  });
}
