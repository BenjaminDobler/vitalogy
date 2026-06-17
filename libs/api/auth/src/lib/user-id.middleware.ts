import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import { PrismaService } from 'db';
import { SESSION_COOKIE } from './auth.controller.js';
import { TokenService } from './token.service.js';

/**
 * Identity resolution for every request. In order of preference:
 *
 *   1. JWT session cookie (web users — canonical signed identity).
 *   2. Authorization: Bearer <jwt> (mobile clients that can't use
 *      httpOnly cookies — same JWT, just carried differently).
 *   3. X-User-Id header (legacy tier-1 trust-the-client tenancy, kept
 *      so existing mobile installs that haven't paired yet still work).
 *   4. DEFAULT_USER_ID fallback (dev convenience), unless AUTH_REQUIRED
 *      is set, in which case we 401.
 *
 * Paths beginning with /api/auth/ skip identity resolution entirely so
 * signup / login / OAuth callbacks / pair-redeem can complete without
 * a session already in place.
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
    // /me reads it directly off the cookie, OAuth callbacks need to run
    // before there's a session at all.
    //
    // Use req.originalUrl because Nest's forRoutes('*') mounts the
    // middleware per-route, which leaves req.path = '/' relative to
    // the mount. originalUrl is always the full client-facing path.
    const url = (req.originalUrl ?? req.url ?? '').split('?')[0];
    if (
      url.startsWith('/api/auth/') ||
      url === '/api/auth' ||
      url.startsWith('/auth/') ||
      url === '/auth'
    ) {
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

    // Mobile clients (Capacitor WebView, etc.) can't rely on httpOnly
    // cookies the same way browsers can — they present the session JWT
    // as an Authorization: Bearer header instead.
    const authHeader = req.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const bearer = authHeader.slice('Bearer '.length).trim();
      if (bearer) {
        const session = await this.tokens.verify(bearer);
        if (session) {
          req.userId = session.sub;
          next();
          return;
        }
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
