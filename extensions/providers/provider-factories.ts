/**
 * Provider factories for multi-credential accounts.
 * Creates Pi provider configs that reuse base provider auth flows
 * but store credentials under account-specific IDs.
 */

import { createHash, randomBytes } from "node:crypto";
import type {
  OAuthCredentials,
  OAuthLoginCallbacks,
} from "@mariozechner/pi-ai";
import type { ProviderConfig } from "@mariozechner/pi-coding-agent";
import type { ProviderAccount } from "./multi-credential";

// === OpenAI Codex OAuth constants ===
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CODEX_REDIRECT_URI = "http://localhost:1455/auth/callback";
const CODEX_SCOPE = "openid profile email offline_access";
const CODEX_JWT_CLAIM_PATH = "https://api.openai.com/auth";

// === Anthropic OAuth constants ===
const ANTHROPIC_CLIENT_ID = "pi-client";
const ANTHROPIC_AUTHORIZE_URL = "https://console.anthropic.com/oauth/authorize";
const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/oauth/token";
const ANTHROPIC_REDIRECT_URI = "http://localhost:1455/auth/callback";
const ANTHROPIC_SCOPE = "openid profile";

// === Utility functions ===

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1] ?? "")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getCodexAccountId(accessToken: string): string | null {
  const payload = decodeJwt(accessToken);
  const auth = payload?.[CODEX_JWT_CLAIM_PATH] as
    | Record<string, unknown>
    | undefined;
  const id = auth?.chatgpt_account_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// === Codex Provider Factory ===

async function exchangeCodexCode(
  code: string,
  verifier: string,
): Promise<OAuthCredentials> {
  const res = await fetch(CODEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CODEX_CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: CODEX_REDIRECT_URI,
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);

  const json = (await res.json()) as Record<string, unknown>;
  const access = json.access_token as string | undefined;
  const refresh = json.refresh_token as string | undefined;
  const expiresIn = json.expires_in as number | undefined;
  if (!access || !refresh) throw new Error("Missing token fields");

  const accountId = getCodexAccountId(access);
  if (!accountId) throw new Error("Failed to extract accountId");

  return {
    access,
    refresh,
    expires: Date.now() + (expiresIn ?? 3600) * 1000,
    accountId,
  };
}

async function refreshCodexToken(rt: string): Promise<OAuthCredentials> {
  const res = await fetch(CODEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: rt,
      client_id: CODEX_CLIENT_ID,
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);

  const json = (await res.json()) as Record<string, unknown>;
  const access = json.access_token as string | undefined;
  const refresh = json.refresh_token as string | undefined;
  const expiresIn = json.expires_in as number | undefined;
  if (!access || !refresh) throw new Error("Missing token fields");

  const accountId = getCodexAccountId(access);
  if (!accountId) throw new Error("Failed to extract accountId");

  return {
    access,
    refresh,
    expires: Date.now() + (expiresIn ?? 3600) * 1000,
    accountId,
  };
}

export function createCodexAccountProvider(
  account: ProviderAccount,
): ProviderConfig {
  return {
    api: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    models: [
      {
        id: "gpt-5.3-codex",
        name: `GPT-5.3 Codex (${account.displayName})`,
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_048_576,
        maxTokens: 65_536,
        compat: { type: "openai-responses" },
      },
    ],
    oauth: {
      name: account.displayName,

      async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
        const { verifier, challenge } = generatePKCE();
        const state = randomBytes(16).toString("hex");

        const url = new URL(CODEX_AUTHORIZE_URL);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", CODEX_CLIENT_ID);
        url.searchParams.set("redirect_uri", CODEX_REDIRECT_URI);
        url.searchParams.set("scope", CODEX_SCOPE);
        url.searchParams.set("code_challenge", challenge);
        url.searchParams.set("code_challenge_method", "S256");
        url.searchParams.set("state", state);
        url.searchParams.set("id_token_add_organizations", "true");
        url.searchParams.set("codex_cli_simplified_flow", "true");
        url.searchParams.set("originator", "pi");

        callbacks.onAuth({ url: url.toString() });

        const input = await callbacks.onPrompt({
          message: "Paste the authorization code or full redirect URL:",
        });

        let code = input.trim();
        try {
          const parsed = new URL(code);
          code = parsed.searchParams.get("code") ?? code;
        } catch {
          // not a URL, use as-is
        }

        return exchangeCodexCode(code, verifier);
      },

      async refreshToken(
        credentials: OAuthCredentials,
      ): Promise<OAuthCredentials> {
        return refreshCodexToken(credentials.refresh);
      },

      getApiKey(credentials: OAuthCredentials): string {
        return credentials.access;
      },
    },
  };
}

// === Anthropic Provider Factory ===

async function exchangeAnthropicCode(
  code: string,
  verifier: string,
): Promise<OAuthCredentials> {
  const res = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ANTHROPIC_CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);

  const json = (await res.json()) as Record<string, unknown>;
  const access = json.access_token as string | undefined;
  const refresh = json.refresh_token as string | undefined;
  const expiresIn = json.expires_in as number | undefined;
  if (!access || !refresh) throw new Error("Missing token fields");

  return {
    access,
    refresh,
    expires: Date.now() + (expiresIn ?? 3600) * 1000,
    accountId: "anthropic",
  };
}

async function refreshAnthropicToken(rt: string): Promise<OAuthCredentials> {
  const res = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: rt,
      client_id: ANTHROPIC_CLIENT_ID,
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);

  const json = (await res.json()) as Record<string, unknown>;
  const access = json.access_token as string | undefined;
  const refresh = json.refresh_token as string | undefined;
  const expiresIn = json.expires_in as number | undefined;
  if (!access || !refresh) throw new Error("Missing token fields");

  return {
    access,
    refresh,
    expires: Date.now() + (expiresIn ?? 3600) * 1000,
    accountId: "anthropic",
  };
}

export function createAnthropicAccountProvider(
  account: ProviderAccount,
): ProviderConfig {
  return {
    api: "anthropic-messages",
    baseUrl: "https://api.anthropic.com/v1",
    models: [
      {
        id: "claude-opus-4",
        name: `Claude Opus 4 (${account.displayName})`,
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
        contextWindow: 200_000,
        maxTokens: 8192,
      },
      {
        id: "claude-sonnet-4",
        name: `Claude Sonnet 4 (${account.displayName})`,
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
        contextWindow: 200_000,
        maxTokens: 8192,
      },
    ],
    oauth: {
      name: account.displayName,

      async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
        const { verifier, challenge } = generatePKCE();
        const state = randomBytes(16).toString("hex");

        const url = new URL(ANTHROPIC_AUTHORIZE_URL);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", ANTHROPIC_CLIENT_ID);
        url.searchParams.set("redirect_uri", ANTHROPIC_REDIRECT_URI);
        url.searchParams.set("scope", ANTHROPIC_SCOPE);
        url.searchParams.set("code_challenge", challenge);
        url.searchParams.set("code_challenge_method", "S256");
        url.searchParams.set("state", state);

        callbacks.onAuth({ url: url.toString() });

        const input = await callbacks.onPrompt({
          message: "Paste the authorization code or full redirect URL:",
        });

        let code = input.trim();
        try {
          const parsed = new URL(code);
          code = parsed.searchParams.get("code") ?? code;
        } catch {
          // not a URL, use as-is
        }

        return exchangeAnthropicCode(code, verifier);
      },

      async refreshToken(
        credentials: OAuthCredentials,
      ): Promise<OAuthCredentials> {
        return refreshAnthropicToken(credentials.refresh);
      },

      getApiKey(credentials: OAuthCredentials): string {
        return credentials.access;
      },
    },
  };
}

// === Synthetic Provider Factory ===

export function createSyntheticAccountProvider(
  account: ProviderAccount,
): ProviderConfig {
  return {
    api: "openai-chat",
    baseUrl: "https://api.synthetic.new/openai/v1",
    models: [
      {
        id: "hf:some-model",
        name: `Synthetic Model (${account.displayName})`,
        reasoning: false,
        input: ["text"],
        cost: { input: 0.55, output: 2.19, cacheRead: 0.55, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 4096,
      },
    ],
    // Synthetic uses API key auth, not OAuth
    // For account-based synthetic providers, we'd need per-account API keys
    // For now, this is a placeholder - accounts for synthetic are not fully supported
    apiKey: process.env.SYNTHETIC_API_KEY ?? "",
  };
}

// === Factory dispatcher ===

export function createAccountProvider(
  account: ProviderAccount,
): ProviderConfig | null {
  switch (account.baseProvider) {
    case "anthropic":
      return createAnthropicAccountProvider(account);
    case "openai-codex":
      return createCodexAccountProvider(account);
    case "synthetic":
      return createSyntheticAccountProvider(account);
    default:
      return null;
  }
}
