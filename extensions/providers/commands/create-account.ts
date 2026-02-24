import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  findAccount,
  getAccounts,
  PROVIDER_DISPLAY_NAMES,
  type ProviderKey,
  saveAccounts,
} from "../config";
import {
  generateDisplayName,
  type ProviderAccount,
  validateAccountId,
} from "../multi-credential";
import { createAccountProvider } from "../provider-factories";

const PROVIDER_CHOICES: { key: ProviderKey; label: string }[] = [
  { key: "anthropic", label: PROVIDER_DISPLAY_NAMES.anthropic },
  { key: "openai-codex", label: PROVIDER_DISPLAY_NAMES["openai-codex"] },
  { key: "synthetic", label: PROVIDER_DISPLAY_NAMES.synthetic },
];

export function setupCreateAccountCommand(pi: ExtensionAPI): void {
  pi.registerCommand("providers:create-account", {
    description: "Create a new provider account",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("This command requires interactive mode", "error");
        return;
      }

      // Step 1: Select base provider
      const baseChoice = await ctx.ui.select(
        "Select base provider",
        PROVIDER_CHOICES.map((p) => p.label),
      );

      if (!baseChoice) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      const baseProvider = PROVIDER_CHOICES.find(
        (p) => p.label === baseChoice,
      )?.key;
      if (!baseProvider) {
        ctx.ui.notify("Invalid selection", "error");
        return;
      }

      // Step 2: Enter account ID
      const accountIdInput = await ctx.ui.input(
        "Account ID",
        `${baseProvider}-`,
      );

      if (!accountIdInput) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      const accountId = accountIdInput.trim().toLowerCase();

      // Validate ID
      const validation = validateAccountId(accountId, baseProvider);
      if (!validation.valid) {
        ctx.ui.notify(validation.error ?? "Invalid account ID", "error");
        return;
      }

      // Check for duplicates
      const existing = findAccount(accountId);
      if (existing) {
        ctx.ui.notify(`Account "${accountId}" already exists`, "error");
        return;
      }

      // Step 3: Enter display name (or use generated)
      const defaultDisplayName = generateDisplayName(baseProvider, accountId);
      const displayNameInput = await ctx.ui.input(
        "Display name",
        defaultDisplayName,
      );

      const displayName = displayNameInput?.trim() || defaultDisplayName;

      // Step 4: Optional description
      const descriptionInput = await ctx.ui.input("Description (optional)");
      const description = descriptionInput?.trim() || undefined;

      // Create account
      const account: ProviderAccount = {
        id: accountId,
        baseProvider,
        displayName,
        description,
      };

      // Save
      const accounts = getAccounts();
      accounts.push(account);
      await saveAccounts(accounts);

      // Register as Pi provider so it appears in /login immediately
      const providerConfig = createAccountProvider(account);
      if (providerConfig) {
        pi.registerProvider(account.id, providerConfig);
      }

      const reload = await ctx.ui.confirm(
        "Account Created",
        `Created "${displayName}" (${accountId}).\n\nReload extensions to register the new provider in /login?`,
      );

      if (reload) {
        await ctx.reload();
      } else {
        ctx.ui.notify(
          `Account created. Run /reload to make it available in /login.`,
          "info",
        );
      }
    },
  });
}
