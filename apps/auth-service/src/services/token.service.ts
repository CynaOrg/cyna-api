import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '@cyna-api/common';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'user' | 'admin';
  role?: string;
}

export interface TempTokenPayload {
  sub: string;
  email: string;
  purpose: '2fa';
}

@Injectable()
export class TokenService {
  private readonly jwtSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>('auth.jwt.secret');
    if (!secret) throw new Error('JWT_SECRET environment variable is required');
    this.jwtSecret = secret;
    this.accessTokenExpiry = this.configService.get<string>('auth.jwt.accessTokenExpiry', '15m');
    this.refreshTokenExpiry = this.configService.get<string>('auth.jwt.refreshTokenExpiry', '7d');
  }

  generateAccessToken(payload: AccessTokenPayload): string {
    // jwtid stamps a unique JTI claim on every token so we can target a single
    // session for revocation. TODO(security): wire JTI blocklist (Redis SET
    // with TTL = remaining token lifetime) at logout — ENABLE JTI BLOCKLIST AT v2.
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.getAccessTokenExpirySeconds(),
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtid: randomUUID(),
    });
  }

  generateTempToken(payload: TempTokenPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: 600, // 10 minutes in seconds
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtid: randomUUID(),
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return jwt.verify(token, this.jwtSecret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as AccessTokenPayload;
  }

  verifyTempToken(token: string): TempTokenPayload {
    return jwt.verify(token, this.jwtSecret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as TempTokenPayload;
  }

  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  getAccessTokenExpirySeconds(): number {
    return this.parseExpiryToSeconds(this.accessTokenExpiry);
  }

  getRefreshTokenExpiryMs(): number {
    return this.parseExpiryToMs(this.refreshTokenExpiry);
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        return 900;
    }
  }

  private parseExpiryToMs(expiry: string): number {
    return this.parseExpiryToSeconds(expiry) * 1000;
  }
}
