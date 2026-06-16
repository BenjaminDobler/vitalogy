import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';

const ALGO = 'HS256';
const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  sub: string; // user id
  email: string;
}

/**
 * JWT signer / verifier. Used for session tokens stored in the
 * httpOnly 'vt_session' cookie. Signed HS256 with JWT_SECRET; we
 * throw a clear error in startup if it isn't set rather than silently
 * accepting an undefined key.
 */
@Injectable()
export class TokenService {
  constructor(private readonly config: ConfigService) {}

  /** 30-day session expiry in seconds (also used to set cookie maxAge). */
  readonly sessionTtlSec = SESSION_TTL_SEC;

  async sign(payload: SessionPayload): Promise<string> {
    return new SignJWT({ email: payload.email })
      .setProtectedHeader({ alg: ALGO })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SEC}s`)
      .sign(this.secret());
  }

  async verify(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret(), {
        algorithms: [ALGO],
      });
      if (typeof payload.sub !== 'string') return null;
      const email = typeof payload['email'] === 'string' ? payload['email'] : '';
      return { sub: payload.sub, email };
    } catch {
      return null;
    }
  }

  private secret(): Uint8Array {
    const raw = this.config.get<string>('JWT_SECRET');
    if (!raw) {
      throw new Error(
        'JWT_SECRET env var is not set — required to sign session tokens.',
      );
    }
    return new TextEncoder().encode(raw);
  }
}
