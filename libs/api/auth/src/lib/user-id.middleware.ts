import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import { PrismaService } from 'db';
import { SESSION_COOKIE } from './auth.controller.js';
import { TokenService } from './token.service.js';

/**
 * Identity resolution for every request. In order of preference:
 *
 *   1. JWT session cookie (web users who logged in via /auth/login or
 *      Google OAuth) — the canonical signed identity.
 *   2. X-User-Id header (mobile recorder — eventually gets its own auth,
 *      but for now it's the same tier-1 trust-the-client tenancy).
 *   3. DEFAULT_USER_ID fallback (dev convenience), unless AUTH_REQUIRED
 *      is set, in which case we 401.
 *
 * Paths beginning with /api/auth/ skip identity resolution entirely so
 * signup / login / OAuth callbacks can complete without a session
 * already in place.
 */

export const DEFAULT_USER_ID = 'dev-user';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

@Injectable()
export class UserIdMiddleware implements NestMiddleware {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    // /api/auth/* bypasses identity — signup/login produce the session,
    // me reads it directly off the cookie, OAuth callbacks need to run
    // before there's a session at all.
    if (req.path.startsWith('/auth/') || req.path === '/auth') {
      next();
      return;
    }

    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (cookieToken) {
      const session = await this.tokens.verify(cookieToken);
      if (session) {
        req.userId = session.sub;
        next();
        return;
      }
    }

    const headerVal = req.headers['x-user-id'];
    const headerUserId =
      typeof headerVal === 'string' && headerVal.length > 0 && headerVal.length < 128
        ? headerVal
        : undefined;
    if (headerUserId) {
      // Auto-provision User row for first-time mobile installs. Skip for
      // the dev default to keep dev-mode requests fast.
      if (headerUserId !== DEFAULT_USER_ID) {
        await this.prisma.user.upsert({
          where: { id: headerUserId },
          create: { id: headerUserId, email: `${headerUserId}@local.vitalogy` },
          update: {},
        });
      }
      req.userId = headerUserId;
      next();
      return;
    }

    if (this.authRequired()) {
      throw new UnauthorizedException('Not authenticated');
    }
    req.userId = DEFAULT_USER_ID;
    next();
  }

  private authRequired(): boolean {
    const v = this.config.get<string>('AUTH_REQUIRED');
    return v === 'true' || v === '1';
  }
}
