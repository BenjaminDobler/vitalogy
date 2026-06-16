import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';

const ROUNDS = 12;

/**
 * bcrypt wrapper. 12 rounds is the standard 2026 cost factor — slow
 * enough that brute force is meaningfully painful, fast enough that
 * login is sub-100ms on modern hardware.
 */
@Injectable()
export class PasswordService {
  hash(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, ROUNDS);
  }

  verify(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  }
}
