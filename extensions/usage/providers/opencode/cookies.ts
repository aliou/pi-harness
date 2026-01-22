import { execSync } from "node:child_process";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expiresAt: Date | null;
}

export interface CookieSession {
  cookies: Cookie[];
  source: "safari" | "helium";
  cookieHeader: string;
}

const OPENCODE_DOMAINS = ["opencode.ai", ".opencode.ai", "app.opencode.ai"];
const AUTH_COOKIE_NAMES = ["auth", "__Host-auth"];

// Safari binary cookies magic value
const SAFARI_MAGIC = Buffer.from("cook");

// Helium (Chrome-based) cookie decryption constants
const HELIUM_KEYCHAIN_SERVICE = "Helium Storage Key";
const HELIUM_KEYCHAIN_ACCOUNT = "Helium";
const CHROME_SALT = "saltysalt";
const CHROME_ITERATIONS = 1003;
const CHROME_KEY_LENGTH = 16;
const CHROME_IV = Buffer.alloc(16, " "); // 16 space bytes

// Chrome on macOS prepends a 32-byte SHA256 hash of the domain to the plaintext
// before encryption (in database versions >= 24)
const DOMAIN_HASH_LENGTH = 32;

function getHeliumCookiesPath(): string {
  return join(
    homedir(),
    "Library/Application Support/net.imput.helium/Default/Cookies",
  );
}

function getSafariCookiesPath(): string {
  return join(
    homedir(),
    "Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies",
  );
}

function getHeliumEncryptionKey(): Buffer | null {
  try {
    const result = execSync(
      `security find-generic-password -s "${HELIUM_KEYCHAIN_SERVICE}" -a "${HELIUM_KEYCHAIN_ACCOUNT}" -w 2>/dev/null`,
      { encoding: "utf-8" },
    ).trim();
    return pbkdf2Sync(
      result,
      CHROME_SALT,
      CHROME_ITERATIONS,
      CHROME_KEY_LENGTH,
      "sha1",
    );
  } catch {
    return null;
  }
}

function decryptHeliumCookie(
  encryptedValue: Buffer,
  key: Buffer,
  domain: string,
): string {
  // Chrome encrypted cookies start with "v10" or "v11" prefix (3 bytes)
  if (encryptedValue.length < 3) return "";

  const version = encryptedValue.subarray(0, 3).toString();
  if (version !== "v10" && version !== "v11") {
    // Not encrypted, return as-is
    return encryptedValue.toString("utf-8");
  }

  // Chrome on macOS uses AES-128-CBC with a fixed IV of 16 spaces
  const encrypted = encryptedValue.subarray(3);
  try {
    const decipher = createDecipheriv("aes-128-cbc", key, CHROME_IV);
    decipher.setAutoPadding(true);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    // Check if the first 32 bytes are the SHA256 hash of the domain
    // (Chrome database version >= 24 prepends this hash)
    if (decrypted.length > DOMAIN_HASH_LENGTH) {
      const expectedHash = createHash("sha256").update(domain).digest();
      const actualHash = decrypted.subarray(0, DOMAIN_HASH_LENGTH);

      if (expectedHash.equals(actualHash)) {
        // Strip the domain hash prefix
        return decrypted.subarray(DOMAIN_HASH_LENGTH).toString("utf-8");
      }
    }

    // Fallback: return the whole decrypted value
    return decrypted.toString("utf-8");
  } catch {
    return "";
  }
}

function readHeliumCookies(): Cookie[] {
  const cookiesPath = getHeliumCookiesPath();
  if (!existsSync(cookiesPath)) return [];

  const key = getHeliumEncryptionKey();
  if (!key) return [];

  let db: Database.Database | null = null;
  try {
    // Open in read-only mode to avoid locking issues
    db = new Database(cookiesPath, { readonly: true, fileMustExist: true });

    const stmt = db.prepare(`
      SELECT host_key, name, value, encrypted_value, path, is_secure, is_httponly, expires_utc
      FROM cookies
      WHERE host_key LIKE '%opencode%'
    `);

    const rows = stmt.all() as Array<{
      host_key: string;
      name: string;
      value: string;
      encrypted_value: Buffer;
      path: string;
      is_secure: number;
      is_httponly: number;
      expires_utc: number;
    }>;

    return rows.map((row) => {
      let value = row.value;
      if (!value && row.encrypted_value?.length > 0) {
        value = decryptHeliumCookie(row.encrypted_value, key, row.host_key);
      }

      // Chrome stores time as microseconds since Jan 1, 1601
      const expiresAt =
        row.expires_utc > 0
          ? new Date((row.expires_utc / 1000 - 11644473600000) / 1000)
          : null;

      return {
        name: row.name,
        value,
        domain: row.host_key,
        path: row.path,
        secure: row.is_secure === 1,
        httpOnly: row.is_httponly === 1,
        expiresAt,
      };
    });
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

// Safari binary cookies parser
function readSafariBinaryCookies(): Cookie[] {
  const cookiesPath = getSafariCookiesPath();
  if (!existsSync(cookiesPath)) return [];

  try {
    const data = readFileSync(cookiesPath);

    // Check magic value
    if (!data.subarray(0, 4).equals(SAFARI_MAGIC)) {
      return [];
    }

    const cookies: Cookie[] = [];

    // Read number of pages (big-endian)
    const numPages = data.readUInt32BE(4);

    // Read page sizes (big-endian)
    const pageSizes: number[] = [];
    for (let i = 0; i < numPages; i++) {
      pageSizes.push(data.readUInt32BE(8 + i * 4));
    }

    // Parse each page
    let pageOffset = 8 + numPages * 4;
    for (const pageSize of pageSizes) {
      const page = data.subarray(pageOffset, pageOffset + pageSize);
      const pageCookies = parseSafariCookiePage(page);
      cookies.push(...pageCookies);
      pageOffset += pageSize;
    }

    // Filter for Opencode domains
    return cookies.filter((c) =>
      OPENCODE_DOMAINS.some(
        (d) => c.domain === d || c.domain.endsWith(`.${d}`),
      ),
    );
  } catch {
    return [];
  }
}

function parseSafariCookiePage(page: Buffer): Cookie[] {
  const cookies: Cookie[] = [];

  // Page header: 4 bytes (should be 0x00000100)
  // Number of cookies: 4 bytes (little-endian)
  const numCookies = page.readUInt32LE(4);

  // Cookie offsets start at byte 8
  for (let i = 0; i < numCookies; i++) {
    const cookieOffset = page.readUInt32LE(8 + i * 4);
    const cookie = parseSafariCookie(page, cookieOffset);
    if (cookie) cookies.push(cookie);
  }

  return cookies;
}

function parseSafariCookie(page: Buffer, offset: number): Cookie | null {
  try {
    // Cookie structure (little-endian):
    // 0-3: size
    // 4-7: unknown
    // 8-11: flags (1=secure, 4=httpOnly)
    // 12-15: unknown
    // 16-19: domain offset
    // 20-23: name offset
    // 24-27: path offset
    // 28-31: value offset
    // 32-39: end of cookie (8 bytes)
    // 40-47: expiry date (double, Mac absolute time)
    // 48-55: creation date (double, Mac absolute time)

    const flags = page.readUInt32LE(offset + 8);
    const domainOffset = page.readUInt32LE(offset + 16);
    const nameOffset = page.readUInt32LE(offset + 20);
    const pathOffset = page.readUInt32LE(offset + 24);
    const valueOffset = page.readUInt32LE(offset + 28);

    // Expiry is a Mac absolute time (seconds since Jan 1, 2001)
    const expiryMacTime = page.readDoubleLE(offset + 40);
    const expiresAt =
      expiryMacTime > 0
        ? new Date((expiryMacTime + 978307200) * 1000) // Convert to Unix time
        : null;

    const readCString = (start: number): string => {
      let end = start;
      while (page[offset + end] !== 0 && offset + end < page.length) end++;
      return page.subarray(offset + start, offset + end).toString("utf-8");
    };

    return {
      domain: readCString(domainOffset),
      name: readCString(nameOffset),
      path: readCString(pathOffset),
      value: readCString(valueOffset),
      secure: (flags & 1) !== 0,
      httpOnly: (flags & 4) !== 0,
      expiresAt,
    };
  } catch {
    return null;
  }
}

function hasAuthCookie(cookies: Cookie[]): boolean {
  return cookies.some((c) => AUTH_COOKIE_NAMES.includes(c.name) && c.value);
}

function buildCookieHeader(cookies: Cookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

export function importOpencodeCookies(): CookieSession | null {
  // Try Safari first (no Keychain access needed, no password prompts)
  const safariCookies = readSafariBinaryCookies();
  if (hasAuthCookie(safariCookies)) {
    return {
      cookies: safariCookies,
      source: "safari",
      cookieHeader: buildCookieHeader(safariCookies),
    };
  }

  // Fall back to Helium (requires Keychain access, may prompt for password)
  const heliumCookies = readHeliumCookies();
  if (hasAuthCookie(heliumCookies)) {
    return {
      cookies: heliumCookies,
      source: "helium",
      cookieHeader: buildCookieHeader(heliumCookies),
    };
  }

  return null;
}
