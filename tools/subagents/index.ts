import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAdvisor } from "./advisor";
import { registerLookAt } from "./look-at";
import { registerOracle } from "./oracle";
import { registerReadSession } from "./read-session";
import { registerReviewer } from "./reviewer";
import { registerScout } from "./scout";

export default async function subagents(pi: ExtensionAPI): Promise<void> {
  await registerAdvisor(pi);
  await registerLookAt(pi);
  await registerOracle(pi);
  await registerReadSession(pi);
  await registerReviewer(pi);
  await registerScout(pi);
}
