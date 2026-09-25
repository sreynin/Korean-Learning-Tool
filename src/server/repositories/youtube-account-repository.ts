import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/server/db/client";
import { decryptToken, encryptToken } from "@/server/youtube/token-store";
import type { YouTubeConnection } from "@/types/youtube";

/**
 * Persistence for the connected YouTube account.
 *
 * One row, always under the same id. This is a single-creator tool; a second
 * connected channel would raise a question the UI never asks ("which channel
 * does this project publish to?"), so connecting again replaces rather than
 * accumulates.
 *
 * Tokens are encrypted on the way in and decrypted on the way out, so no
 * caller ever handles ciphertext and nothing above this file can accidentally
 * persist a plaintext credential. `toConnection()` is the only shape that
 * leaves for the browser, and it has no token field at all.
 */
export const SINGLETON_ACCOUNT_ID = "youtube";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** ISO 8601 */
  expiresAt: string;
}

export interface AccountRecord extends StoredTokens {
  channelId: string;
  channelTitle: string;
  scopes: string[];
  connectedAt: string;
}

export class YouTubeAccountRepository {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = getDb()) {
    this.db = db;
  }

  /** The connection as the browser may see it: no tokens, ever. */
  async getConnection(): Promise<YouTubeConnection | null> {
    const row = await this.db.youTubeAccount.findUnique({
      where: { id: SINGLETON_ACCOUNT_ID },
    });

    if (!row) return null;

    return {
      channelId: row.channelId,
      channelTitle: row.channelTitle,
      connectedAt: row.connectedAt.toISOString(),
      scopes: parseScopes(row.scopes),
    };
  }

  /** The full record, tokens decrypted. Server-side callers only. */
  async getAccount(): Promise<AccountRecord | null> {
    const row = await this.db.youTubeAccount.findUnique({
      where: { id: SINGLETON_ACCOUNT_ID },
    });

    if (!row) return null;

    return {
      channelId: row.channelId,
      channelTitle: row.channelTitle,
      scopes: parseScopes(row.scopes),
      connectedAt: row.connectedAt.toISOString(),
      accessToken: decryptToken(row.accessTokenEncrypted),
      refreshToken: decryptToken(row.refreshTokenEncrypted),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async save(account: {
    channelId: string;
    channelTitle: string;
    scopes: string[];
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  }): Promise<YouTubeConnection> {
    const now = new Date();

    // Encrypting before the write means a failure to encrypt is a failure to
    // store, rather than a row that quietly holds a plaintext token.
    const data = {
      channelId: account.channelId,
      channelTitle: account.channelTitle,
      scopes: JSON.stringify(account.scopes),
      accessTokenEncrypted: encryptToken(account.accessToken),
      refreshTokenEncrypted: encryptToken(account.refreshToken),
      expiresAt: new Date(account.expiresAt),
      updatedAt: now,
    };

    const row = await this.db.youTubeAccount.upsert({
      where: { id: SINGLETON_ACCOUNT_ID },
      create: { id: SINGLETON_ACCOUNT_ID, ...data, connectedAt: now },
      update: data,
    });

    return {
      channelId: row.channelId,
      channelTitle: row.channelTitle,
      connectedAt: row.connectedAt.toISOString(),
      scopes: parseScopes(row.scopes),
    };
  }

  /** Stores a refreshed access token without touching the rest of the row. */
  async updateTokens(tokens: StoredTokens): Promise<void> {
    await this.db.youTubeAccount.update({
      where: { id: SINGLETON_ACCOUNT_ID },
      data: {
        accessTokenEncrypted: encryptToken(tokens.accessToken),
        refreshTokenEncrypted: encryptToken(tokens.refreshToken),
        expiresAt: new Date(tokens.expiresAt),
        updatedAt: new Date(),
      },
    });
  }

  async clear(): Promise<void> {
    await this.db.youTubeAccount.deleteMany({
      where: { id: SINGLETON_ACCOUNT_ID },
    });
  }
}

function parseScopes(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const globalForAccounts = globalThis as unknown as {
  __youtubeAccountRepository?: YouTubeAccountRepository;
};

export function getYouTubeAccountRepository(): YouTubeAccountRepository {
  if (!globalForAccounts.__youtubeAccountRepository) {
    globalForAccounts.__youtubeAccountRepository = new YouTubeAccountRepository();
  }
  return globalForAccounts.__youtubeAccountRepository;
}
