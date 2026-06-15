import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'db';
import type { AIProvider } from 'data-models';
import { decrypt, encrypt } from './crypto.js';

export interface ApiKeyView {
  provider: AIProvider;
  label: string | null;
  lastFour: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Stores per-user AI provider keys encrypted at rest. The chat / analysis
 * services use `getDecrypted` to grab the plaintext value just before
 * passing it to an SDK client; the value never crosses the wire to the
 * browser after the initial POST that registered it.
 *
 * Future "Pro account" flag can short-circuit this and use a
 * server-managed key instead — see ChatService.resolveAnthropicKey.
 */
@Injectable()
export class KeyService {
  private readonly logger = new Logger(KeyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ApiKeyView[]> {
    const rows = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      provider: r.provider as AIProvider,
      label: r.label,
      lastFour: r.lastFour,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /**
   * Upsert the key for (user, provider). Trims whitespace, strips an
   * accidentally-pasted "Bearer " prefix, and stores the last-4 chars
   * separately for UI display.
   */
  async upsert(
    userId: string,
    provider: AIProvider,
    apiKey: string,
    label?: string,
  ): Promise<ApiKeyView> {
    await this.ensureUser(userId);
    const cleaned = apiKey.trim().replace(/^Bearer\s+/i, '');
    if (cleaned.length < 8) {
      throw new Error('API key looks too short to be valid');
    }
    const encrypted = encrypt(cleaned);
    const lastFour = cleaned.slice(-4);
    const row = await this.prisma.apiKey.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, encryptedKey: encrypted, lastFour, label: label ?? null },
      update: { encryptedKey: encrypted, lastFour, label: label ?? null, updatedAt: new Date() },
    });
    return {
      provider: row.provider as AIProvider,
      label: row.label,
      lastFour: row.lastFour,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async delete(userId: string, provider: AIProvider): Promise<void> {
    await this.prisma.apiKey.deleteMany({ where: { userId, provider } });
  }

  /**
   * Plaintext key for use by a provider SDK. Returns null if no key was
   * configured for this user/provider — caller decides whether to fall
   * back to a SERVER env var or surface an error.
   */
  async getDecrypted(userId: string, provider: AIProvider): Promise<string | null> {
    const row = await this.prisma.apiKey.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!row) return null;
    try {
      return decrypt(row.encryptedKey);
    } catch (err) {
      // Most likely the encryption secret was rotated without re-uploading
      // keys. Log + treat as missing so the caller can fall back cleanly.
      this.logger.error(
        `Failed to decrypt ${provider} key for user ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private async ensureUser(userId: string): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: `${userId}@local.vitalogy` },
      update: {},
    });
  }
}
