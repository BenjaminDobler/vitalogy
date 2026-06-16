import {
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { PrismaService } from 'db';
import { SESSION_COOKIE } from './auth.controller.js';
import { TokenService } from './token.service.js';

const STATE_COOKIE = 'vt_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 min — Google rarely takes longer
const POST_AUTH_REDIRECT = '/';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token?: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

@Controller('auth/google')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Kick off the OAuth dance. We mint a random state token, drop it
   * into a short-lived httpOnly cookie, and forward the user to Google.
   * The callback verifies the cookie matches the returned state — the
   * standard CSRF defense for redirect-based OAuth.
   */
  @Get('start')
  start(@Res() res: Response): void {
    const state = randomBytes(32).toString('hex');
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV') === 'production',
      path: '/api/auth/google/callback',
      maxAge: STATE_TTL_MS,
    });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', this.requireConfig('GOOGLE_CLIENT_ID'));
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');
    res.redirect(url.toString());
  }

  /**
   * Google redirects here with ?code=... after the user consents. We
   * exchange the code for an access token, fetch the userinfo, find or
   * create the matching User row (linked by googleId or email), set our
   * session cookie, and bounce the user back to the app root.
   */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      res.status(400).send(`Google auth failed: ${error}`);
      return;
    }
    if (!code || !state) {
      res.status(400).send('Google auth failed: missing code or state');
      return;
    }
    const cookieState = (req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/api/auth/google/callback' });
    if (!cookieState || cookieState !== state) {
      res.status(400).send('Google auth failed: state mismatch (CSRF guard)');
      return;
    }

    try {
      const token = await this.exchangeCode(code);
      const userinfo = await this.fetchUserInfo(token.access_token);
      if (!userinfo.email) throw new Error('Google returned no email');
      const user = await this.upsertUser(userinfo);
      const session = await this.tokens.sign({ sub: user.id, email: user.email });
      res.cookie(SESSION_COOKIE, session, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.config.get('NODE_ENV') === 'production',
        path: '/',
        maxAge: this.tokens.sessionTtlSec * 1000,
      });
      res.redirect(POST_AUTH_REDIRECT);
    } catch (err) {
      this.logger.error('Google callback failed', err);
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).send(`Google auth failed: ${message}`);
    }
  }

  private async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.requireConfig('GOOGLE_CLIENT_ID'),
      client_secret: this.requireConfig('GOOGLE_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri(),
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as GoogleTokenResponse;
  }

  private async fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google userinfo failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as GoogleUserInfo;
  }

  /**
   * Find an existing user (by googleId first, then by email — so a
   * password-signed-up user gets their Google linked automatically) or
   * create a new row.
   */
  private async upsertUser(info: GoogleUserInfo): Promise<{ id: string; email: string }> {
    const email = info.email.toLowerCase();
    const byGoogle = await this.prisma.user.findUnique({
      where: { googleId: info.sub },
    });
    if (byGoogle) return byGoogle;
    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      const updated = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: info.sub,
          ...(byEmail.name ? {} : { name: info.name ?? null }),
        },
      });
      return updated;
    }
    return this.prisma.user.create({
      data: { email, name: info.name ?? null, googleId: info.sub },
    });
  }

  private redirectUri(): string {
    return (
      this.config.get<string>('GOOGLE_REDIRECT_URI') ??
      'http://localhost:3000/api/auth/google/callback'
    );
  }

  private requireConfig(key: string): string {
    const v = this.config.get<string>(key);
    if (!v) {
      throw new InternalServerErrorException(`Missing config: ${key}`);
    }
    return v;
  }
}
