const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const OFFSCREEN_DOCUMENT_REASON = "BLOBS" as unknown as chrome.offscreen.Reason;

let creatingOffscreenDocument: Promise<void> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

  if ("getContexts" in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl],
    });

    return contexts.length > 0;
  }

  const serviceWorkerGlobal = globalThis as unknown as {
    clients?: {
      matchAll: () => Promise<Array<{ url: string }>>;
    };
  };

  const matchedClients = await serviceWorkerGlobal.clients?.matchAll();
  return (matchedClients ?? []).some((client) => client.url === offscreenUrl);
}

export async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [OFFSCREEN_DOCUMENT_REASON],
    justification:
      "Create Blob/Object URL for network export downloads in MV3.",
  });

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

interface OffscreenCreateBlobUrlRequest {
  type: "OFFSCREEN_CREATE_BLOB_URL";
  payload: unknown;
}

interface OffscreenCreateBlobUrlResponse {
  ok: boolean;
  url?: string;
  error?: string;
}

interface OffscreenRevokeBlobUrlRequest {
  type: "OFFSCREEN_REVOKE_BLOB_URL";
  url: string;
}

interface OffscreenRevokeBlobUrlResponse {
  ok: boolean;
  error?: string;
}

async function sendMessage<TRequest, TResponse>(
  message: TRequest,
): Promise<TResponse> {
  return new Promise<TResponse>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: TResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

export async function createBlobUrlInOffscreen(
  payload: unknown,
): Promise<string> {
  await ensureOffscreenDocument();

  const response = await sendMessage<
    OffscreenCreateBlobUrlRequest,
    OffscreenCreateBlobUrlResponse
  >({
    type: "OFFSCREEN_CREATE_BLOB_URL",
    payload,
  });

  if (!response.ok || typeof response.url !== "string") {
    throw new Error(response.error ?? "Failed to create offscreen blob URL");
  }

  return response.url;
}

export async function revokeBlobUrlInOffscreen(url: string): Promise<void> {
  const response = await sendMessage<
    OffscreenRevokeBlobUrlRequest,
    OffscreenRevokeBlobUrlResponse
  >({
    type: "OFFSCREEN_REVOKE_BLOB_URL",
    url,
  });

  if (!response.ok) {
    throw new Error(response.error ?? "Failed to revoke offscreen blob URL");
  }
}
