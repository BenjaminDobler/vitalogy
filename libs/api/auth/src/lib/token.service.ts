import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';

const ALGO = 'HS256';
const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30 days
const PAIR_TTL_SEC = 5 * 60; // 5 minutes — long enough to scan, short enough to be safe

export interface SessionPayload {
  sub: string; // user id
  email: string;
}

export interface PairPayload {
  sub: string;
  email: string;
  purpose: 'pair';
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
      // Reject pair tokens here so a pairing JWT can't accidentally be
      // used as a session token.
      if (payload['purpose'] != null) return null;
      if (typeof payload.sub !== 'string') return null;
      const email = typeof payload['email'] === 'string' ? payload['email'] : '';
      return { sub: payload.sub, email };
    } catch {
      return null;
    }
  }

  /** Pair-TTL in seconds — used by the web UI to drive the countdown. */
  readonly pairTtlSec = PAIR_TTL_SEC;

  /**
   * Short-lived QR pairing token. The web app shows this as a QR code;
   * the mobile app scans it, hits /auth/pair/redeem, and gets a real
   * session token back. Purpose claim prevents replay as a session.
   */
  async signPair(payload: SessionPayload): Promise<string> {
    return new SignJWT({ email: payload.email, purpose: 'pair' })
      .setProtectedHeader({ alg: ALGO })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(`${PAIR_TTL_SEC}s`)
      .sign(this.secret());
  }

  async verifyPair(token: string): Promise<PairPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret(), {
        algorithms: [ALGO],
      });
      if (payload['purpose'] !== 'pair') return null;
      if (typeof payload.sub !== 'string') return null;
      const email = typeof payload['email'] === 'string' ? payload['email'] : '';
      return { sub: payload.sub, email, purpose: 'pair' };
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
