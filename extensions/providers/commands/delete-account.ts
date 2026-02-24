import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { findAccount, getAccounts, saveAccounts } from "../config";

export function setupDeleteAccountCommand(pi: ExtensionAPI): void {
  pi.registerCommand("providers:delete-account", {
    description: "Delete a provider account",
    handler: async (args, ctx) => {
      const accountId = String(args ?? "")
        .trim()
        .toLowerCase();

      if (!accountId) {
        if (!ctx.hasUI) {
          ctx.ui.notify(
            "Usage: /providers:delete-account <account-id>",
            "error",
          );
          return;
        }

        // Interactive: list accounts
        const accounts = getAccounts();
        if (accounts.length === 0) {
          ctx.ui.notify("No accounts to delete", "error");
          return;
        }

        const choice = await ctx.ui.select(
          "Select account to delete",
          accounts.map((a) => `${a.id} (${a.displayName})`),
        );

        // Extract account ID from choice
        const selectedId = choice?.split(" ")[0];

        if (!selectedId) {
          ctx.ui.notify("Cancelled", "info");
          return;
        }

        return deleteAccount(selectedId, ctx);
      }

      // Direct account ID provided
      return deleteAccount(accountId, ctx);
    },
  });
}

async function deleteAccount(
  accountId: string,
  ctx: Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1],
): Promise<void> {
  const account = findAccount(accountId);
  if (!account) {
    ctx.ui.notify(`Account "${accountId}" not found`, "error");
    return;
  }

  // Confirm deletion
  const confirm = await ctx.ui.confirm(
    "Delete Account",
    `Delete "${account.displayName}" (${account.id})?\n\nNote: Credentials remain in auth storage. Run /logout ${account.id} separately if needed.`,
  );

  if (!confirm) {
    ctx.ui.notify("Cancelled", "info");
    return;
  }

  // Remove from config
  const accounts = getAccounts().filter((a) => a.id !== accountId);
  await saveAccounts(accounts);

  ctx.ui.notify(`Deleted account "${accountId}"`, "info");
}
