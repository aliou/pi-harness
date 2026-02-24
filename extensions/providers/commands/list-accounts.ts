import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAccounts } from "../config";

export function setupListAccountsCommand(pi: ExtensionAPI): void {
  pi.registerCommand("providers:list-accounts", {
    description: "List all configured provider accounts",
    handler: async (_args, ctx) => {
      const accounts = getAccounts();

      if (accounts.length === 0) {
        ctx.ui.notify(
          "No accounts configured. Use /providers:create-account to add one.",
          "info",
        );
        return;
      }

      // Build table as message
      const lines: string[] = [];
      lines.push("");
      lines.push(
        `  ${"ID".padEnd(30)} ${"Base Provider".padEnd(15)} ${"Display Name"}`,
      );
      lines.push(`  ${"─".repeat(30)} ${"─".repeat(15)} ${"─".repeat(30)}`);

      for (const account of accounts) {
        const id = account.id.slice(0, 30).padEnd(30);
        const base = account.baseProvider.slice(0, 15).padEnd(15);
        const name = account.displayName.slice(0, 30);
        lines.push(`  ${id} ${base} ${name}`);
      }

      lines.push("");
      lines.push("  Run /login to authenticate an account.");

      const message = lines.join("\n");
      ctx.ui.notify(message, "info");
    },
  });
}
