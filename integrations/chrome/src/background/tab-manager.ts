import type { PageCommand } from "@/content/page-types";

function isMissingContentScriptError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Could not establish connection/i.test(error.message);
}

async function tryInjectContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/content/main.js"],
  });
}

export function isScriptableUrl(url?: string): boolean {
  if (!url) return false;

  return ![
    "chrome://",
    "chrome-extension://",
    "about:",
    "edge://",
    "devtools://",
  ].some((prefix) => url.startsWith(prefix));
}

export async function sendToContentScript(
  tabId: number,
  message: PageCommand,
): Promise<unknown> {
  const tab = await chrome.tabs.get(tabId);

  if (!isScriptableUrl(tab.url)) {
    throw new Error(
      `Cannot interact with ${tab.url ?? "this page"} (system page). Navigate to a regular webpage first.`,
    );
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    if (!response?.ok) {
      throw new Error(
        typeof response?.error === "string"
          ? response.error
          : "Content script command failed",
      );
    }
    return response.result;
  } catch (error) {
    if (!isMissingContentScriptError(error)) {
      throw error;
    }

    await tryInjectContentScript(tabId);

    const response = await chrome.tabs.sendMessage(tabId, message);
    if (!response?.ok) {
      throw new Error(
        typeof response?.error === "string"
          ? response.error
          : "Content script command failed after injection",
      );
    }
    return response.result;
  }
}
