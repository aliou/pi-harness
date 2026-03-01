import { InteractionEngine } from "./interaction-engine";
import { isPageCommand, type PageCommand } from "./page-types";
import { PageReader } from "./read-page";
import { RefModel } from "./ref-model";

const refModel = new RefModel();
const interaction = new InteractionEngine(refModel);
const reader = new PageReader(refModel);

const INDICATOR_ID = "pi-chrome-tool-indicator";

function setIndicator(active: boolean): void {
  const existing = document.getElementById(INDICATOR_ID);

  if (!active) {
    existing?.remove();
    return;
  }

  if (existing) return;

  const container = document.createElement("div");
  container.id = INDICATOR_ID;
  container.setAttribute("aria-live", "polite");
  container.textContent = "Pi is active";
  container.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "padding:8px 10px",
    "border-radius:9999px",
    "font:600 12px/1.1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif",
    "color:#111827",
    "background:rgba(255,255,255,0.95)",
    "border:1px solid rgba(17,24,39,0.2)",
    "box-shadow:0 4px 14px rgba(0,0,0,0.15)",
    "pointer-events:none",
    "animation:piPulse 1.2s ease-in-out infinite",
  ].join(";");

  const style = document.createElement("style");
  style.textContent = `
    @keyframes piPulse {
      0% { transform: scale(1); opacity: .9; }
      50% { transform: scale(1.04); opacity: 1; }
      100% { transform: scale(1); opacity: .9; }
    }
  `;

  container.appendChild(style);
  document.documentElement.appendChild(container);
}

async function handlePageCommand(message: PageCommand): Promise<unknown> {
  switch (message.type) {
    case "PAGE_CLICK":
      return interaction.click(message.params);
    case "PAGE_TYPE":
      return interaction.type(message.params);
    case "PAGE_SCROLL":
      return interaction.scroll(message.params);
    case "PAGE_KEY":
      return interaction.key(message.params);
    case "PAGE_HOVER":
      return interaction.hover(message.params);
    case "PAGE_FORM_INPUT":
      return interaction.formInput(message.params);
    case "PAGE_GET_TEXT":
      return reader.getText();
    case "PAGE_READ_PAGE":
      return reader.readPage();
    case "PAGE_FIND":
      return reader.find(message.params);
    case "PAGE_SET_INDICATOR":
      setIndicator(message.params.active);
      return { active: message.params.active };
  }

  const exhaustive: never = message;
  throw new Error(`Unknown command: ${String(exhaustive)}`);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isPageCommand(message)) {
    return false;
  }

  handlePageCommand(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error: unknown) => {
      const messageText =
        error instanceof Error ? error.message : "Unknown content script error";
      sendResponse({ ok: false, error: messageText });
    });

  return true;
});

window.addEventListener("beforeunload", () => {
  setIndicator(false);
  refModel.clear();
});
