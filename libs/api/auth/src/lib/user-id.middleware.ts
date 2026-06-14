import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { PrismaService } from 'db';

/**
 * Tier-1 "trust the client" tenancy: read `X-User-Id` from the request and use
 * it to scope every downstream DB query. If missing, fall back to a default so
 * the web app (which doesn't send the header) still works out of the box.
 *
 * Each first-seen userId gets a User row created automatically — this is fine
 * for a single-user / personal-app stage. When we upgrade to Tier 2 (shared
 * API key) or Tier 3 (OAuth / Sign in with Apple), this is the single piece
 * of code that changes: identity becomes signature-verified instead of
 * trust-the-header.
 */

export const DEFAULT_USER_ID = 'dev-user';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

@Injectable()
export class UserIdMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const headerVal = req.headers['x-user-id'];
    const headerUserId =
      typeof headerVal === 'string' && headerVal.length > 0 && headerVal.length < 128
        ? headerVal
        : undefined;
    const userId = headerUserId ?? DEFAULT_USER_ID;

    // Auto-provision the User row if a new client identifies itself for the first time.
    // For the default user, skip the upsert to keep web-app requests fast.
    if (headerUserId && headerUserId !== DEFAULT_USER_ID) {
      await this.prisma.user.upsert({
        where: { id: userId },
        create: {
          id: userId,
          email: `${userId}@local.vitalogy`,
        },
        update: {},
      });
    }

    req.userId = userId;
    next();
  }
}
