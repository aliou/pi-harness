(() => {
  const createdUrls = new Set();

  function toErrorMessage(error) {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return false;
    }

    if (message.type === "OFFSCREEN_CREATE_BLOB_URL") {
      try {
        const blob = new Blob([JSON.stringify(message.payload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        createdUrls.add(url);
        sendResponse({ ok: true, url });
      } catch (error) {
        sendResponse({ ok: false, error: toErrorMessage(error) });
      }
      return true;
    }

    if (message.type === "OFFSCREEN_REVOKE_BLOB_URL") {
      try {
        if (typeof message.url === "string") {
          URL.revokeObjectURL(message.url);
          createdUrls.delete(message.url);
        }
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: toErrorMessage(error) });
      }
      return true;
    }

    return false;
  });

  self.addEventListener("unload", () => {
    for (const url of createdUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    createdUrls.clear();
  });
})();
