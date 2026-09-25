import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/server/errors";

/**
 * Encryption for the OAuth tokens this app stores.
 *
 * A YouTube refresh token is a long-lived credential that can upload to
 * someone's channel until they revoke it. The database file sits in `data/`
 * next to the renders, so anything that can read the disk can read the table —
 * which is why the token is encrypted before it ever reaches a row.
 *
 * AES-256-GCM, from `node:crypto`. GCM rather than CBC because it
 * authenticates as well as encrypts: a tampered ciphertext fails to decrypt
 * instead of decrypting to something else. Each value gets a fresh random IV,
 * so encrypting the same token twice never produces the same bytes.
 *
 * **There is deliberately no plaintext fallback.** If `YOUTUBE_TOKEN_KEY` is
 * missing, storing a token throws. Writing credentials in the clear because
 * configuration was incomplete is exactly the failure this file exists to
 * prevent, and a loud error at connect time is recoverable in a way a silently
 * leaked refresh token is not.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
const FORMAT_VERSION = "v1";

export class TokenEncryptionError extends AppError {
  constructor(message: string) {
    super("conflict", message, 409);
  }
}

/**
 * Reads and validates the configured key.
 *
 * Accepts base64 or hex so the value can come from `openssl rand -base64 32`
 * or `-hex 32` without the operator having to care which this file wanted.
 */
export function getTokenKey(): Buffer {
  const { YOUTUBE_TOKEN_KEY } = getServerEnv();

  if (!YOUTUBE_TOKEN_KEY) {
    throw new TokenEncryptionError(
      "YOUTUBE_TOKEN_KEY is not set, so there is nowhere safe to keep a YouTube token. Generate one with `openssl rand -base64 32` and restart.",
    );
  }

  const key = decodeKey(YOUTUBE_TOKEN_KEY);

  if (key.length !== KEY_BYTES) {
    throw new TokenEncryptionError(
      `YOUTUBE_TOKEN_KEY must decode to ${KEY_BYTES} bytes, but decoded to ${key.length}. Generate one with \`openssl rand -base64 32\`.`,
    );
  }

  return key;
}

/** True when a token could be stored right now. Never reveals the key. */
export function canStoreTokens(): boolean {
  try {
    getTokenKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(plaintext: string): string {
  const key = getTokenKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    FORMAT_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptToken(stored: string): string {
  const key = getTokenKey();
  const parts = stored.split(".");

  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new TokenEncryptionError(
      "The stored YouTube token is not in a format this version understands. Reconnect the account.",
    );
  }

  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new TokenEncryptionError(
      "The stored YouTube token is malformed. Reconnect the account.",
    );
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Either the key changed or the row was tampered with. Both mean the same
    // thing to the creator, and neither should say which.
    throw new TokenEncryptionError(
      "The stored YouTube token could not be read with the current YOUTUBE_TOKEN_KEY. Reconnect the account.",
    );
  }
}

/**
 * Constant-time comparison for the OAuth `state` value.
 *
 * `===` on a secret leaks its prefix through timing. The lengths are compared
 * first because `timingSafeEqual` throws on a mismatch, and a length
 * difference is not secret.
 */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function decodeKey(raw: string): Buffer {
  const trimmed = raw.trim();

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === KEY_BYTES * 2) {
    return Buffer.from(trimmed, "hex");
  }

  return Buffer.from(trimmed, "base64");
}
