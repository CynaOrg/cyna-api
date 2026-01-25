import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

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
    this.jwtSecret = this.configService.get<string>('auth.jwt.secret', 'change-me');
    this.accessTokenExpiry = this.configService.get<string>('auth.jwt.accessTokenExpiry', '15m');
    this.refreshTokenExpiry = this.configService.get<string>('auth.jwt.refreshTokenExpiry', '7d');
  }

  generateAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.getAccessTokenExpirySeconds(),
    });
  }

  generateTempToken(payload: TempTokenPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: 600, // 10 minutes in seconds
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return jwt.verify(token, this.jwtSecret) as AccessTokenPayload;
  }

  verifyTempToken(token: string): TempTokenPayload {
    return jwt.verify(token, this.jwtSecret) as TempTokenPayload;
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
