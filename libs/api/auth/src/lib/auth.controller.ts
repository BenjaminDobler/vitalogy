import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PrismaService } from 'db';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

interface SignupBody {
  email: string;
  password: string;
  name?: string;
}
interface LoginBody {
  email: string;
  password: string;
}
interface PairRedeemBody {
  token: string;
}

/** Shape returned by signup/login/redeem — includes the JWT for mobile clients. */
interface AuthSuccessResponse {
  id: string;
  email: string;
  name: string | null;
  token: string;
}

/** Cookie that carries the JWT session token. */
export const SESSION_COOKIE = 'vt_session';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Create a new account. Email must be unused. Password must be at least
   * 8 chars (a deliberately low bar — UX over performative strict rules;
   * users still hash through bcrypt at 12 rounds).
   */
  @Post('signup')
  async signup(
    @Body() body: SignupBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSuccessResponse> {
    const email = sanitizeEmail(body.email);
    const password = body.password ?? '';
    if (!isValidEmail(email)) throw new BadRequestException('Invalid email');
    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('Email already registered');

    const passwordHash = await this.passwords.hash(password);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: body.name?.trim() || null,
        passwordHash,
      },
    });

    const token = await this.issueSession(res, user.id, user.email);
    return { id: user.id, email: user.email, name: user.name, token };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSuccessResponse> {
    const email = sanitizeEmail(body.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      // Don't disclose whether it's the email or the password that failed.
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await this.passwords.verify(body.password ?? '', user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

    const token = await this.issueSession(res, user.id, user.email);
    return { id: user.id, email: user.email, name: user.name, token };
  }

  /**
   * Generate a short-lived pairing token that the web client renders as
   * a QR code. The mobile app scans + posts to /pair/redeem to exchange
   * it for a real session JWT. Requires an authenticated caller — only
   * a signed-in user can mint pairing tokens for their own account.
   */
  @Post('pair/create')
  async createPair(@Req() req: Request): Promise<{ token: string; expiresInSec: number }> {
    const userId = req.userId;
    if (!userId) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const token = await this.tokens.signPair({ sub: user.id, email: user.email });
    return { token, expiresInSec: this.tokens.pairTtlSec };
  }

  /**
   * Mobile-side endpoint: takes a pairing JWT from the scanned QR code
   * and returns a session JWT bound to the same user. We don't set the
   * cookie here — mobile carries the token as a Bearer header — but
   * the web flow could also call this if it wanted to.
   */
  @Post('pair/redeem')
  @HttpCode(200)
  async redeemPair(
    @Body() body: PairRedeemBody,
  ): Promise<AuthSuccessResponse> {
    const pair = await this.tokens.verifyPair(body.token ?? '');
    if (!pair) {
      throw new UnauthorizedException('Pairing token is invalid or expired');
    }
    const user = await this.prisma.user.findUnique({ where: { id: pair.sub } });
    if (!user) throw new UnauthorizedException();
    const token = await this.tokens.sign({ sub: user.id, email: user.email });
    return { id: user.id, email: user.email, name: user.name, token };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions(0));
  }

  /** Current session, or null if the cookie's missing / invalid. */
  @Get('me')
  async me(@Req() req: Request): Promise<{
    id: string;
    email: string;
    name: string | null;
  } | null> {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!token) return null;
    const session = await this.tokens.verify(token);
    if (!session) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: session.sub },
    });
    if (!user) return null;
    return { id: user.id, email: user.email, name: user.name };
  }

  /**
   * Sign a session JWT, set it as the web cookie, AND return the raw
   * token so mobile clients (which can't rely on httpOnly cookies the
   * same way) can grab it from the response body.
   */
  private async issueSession(
    res: Response,
    userId: string,
    email: string,
  ): Promise<string> {
    const token = await this.tokens.sign({ sub: userId, email });
    res.cookie(SESSION_COOKIE, token, this.cookieOptions(this.tokens.sessionTtlSec * 1000));
    return token;
  }

  private cookieOptions(maxAgeMs: number): {
    httpOnly: boolean;
    sameSite: 'lax';
    secure: boolean;
    path: string;
    maxAge?: number;
  } {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV') === 'production',
      path: '/',
      ...(maxAgeMs > 0 ? { maxAge: maxAgeMs } : {}),
    };
  }
}

function sanitizeEmail(raw: string | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  // Permissive — accept anything that has a single '@' and a '.' after it.
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}
