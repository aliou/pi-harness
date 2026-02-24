import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupUsageCommands } from "./commands";
import { configLoader, getAccounts } from "./config";
import { setupUsageHooks } from "./hooks";
import { createAccountProvider } from "./provider-factories";

export default async function providersExtension(
  pi: ExtensionAPI,
): Promise<void> {
  await configLoader.load();

  // Register all configured accounts as Pi providers
  // This makes them available in /login
  const accounts = getAccounts();
  for (const account of accounts) {
    const providerConfig = createAccountProvider(account);
    if (providerConfig) {
      pi.registerProvider(account.id, providerConfig);
    }
  }

  setupUsageCommands(pi);
  setupUsageHooks(pi);
}

// Export for use by commands that create new accounts
export { createAccountProvider };
