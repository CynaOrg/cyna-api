import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;
  const mockSecret = 'test-secret-key-minimum-32-characters!!';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                'auth.jwt.secret': mockSecret,
                'auth.jwt.accessTokenExpiry': '15m',
                'auth.jwt.refreshTokenExpiry': '7d',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT access token', () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        type: 'user' as const,
      };

      const token = service.generateAccessToken(payload);

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify and decode a valid access token', () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        type: 'user' as const,
      };

      const token = service.generateAccessToken(payload);
      const decoded = service.verifyAccessToken(token);

      expect(decoded.sub).toBe('user-123');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.type).toBe('user');
    });

    it('should throw error for invalid token', () => {
      expect(() => {
        service.verifyAccessToken('invalid-token');
      }).toThrow();
    });
  });

  describe('generateTempToken', () => {
    it('should generate a valid temp token for 2FA', () => {
      const payload = {
        sub: 'admin-123',
        email: 'admin@example.com',
        purpose: '2fa' as const,
      };

      const token = service.generateTempToken(payload);

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('verifyTempToken', () => {
    it('should verify and decode a valid temp token', () => {
      const payload = {
        sub: 'admin-123',
        email: 'admin@example.com',
        purpose: '2fa' as const,
      };

      const token = service.generateTempToken(payload);
      const decoded = service.verifyTempToken(token);

      expect(decoded.sub).toBe('admin-123');
      expect(decoded.email).toBe('admin@example.com');
      expect(decoded.purpose).toBe('2fa');
    });
  });

  describe('generateSecureToken', () => {
    it('should generate a random hex string', () => {
      const token = service.generateSecureToken();

      expect(token).toBeDefined();
      expect(token.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });

    it('should generate tokens with custom length', () => {
      const token = service.generateSecureToken(16);

      expect(token.length).toBe(32);
    });

    it('should generate unique tokens', () => {
      const token1 = service.generateSecureToken();
      const token2 = service.generateSecureToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('hashToken', () => {
    it('should hash a token using SHA256', () => {
      const token = 'test-token-123';
      const hash = service.hashToken(token);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
      expect(hash).not.toBe(token);
    });

    it('should produce consistent hash for same input', () => {
      const token = 'test-token-123';
      const hash1 = service.hashToken(token);
      const hash2 = service.hashToken(token);

      expect(hash1).toBe(hash2);
    });
  });

  describe('getAccessTokenExpirySeconds', () => {
    it('should return expiry in seconds', () => {
      const seconds = service.getAccessTokenExpirySeconds();

      expect(seconds).toBe(15 * 60);
    });
  });

  describe('getRefreshTokenExpiryMs', () => {
    it('should return expiry in milliseconds', () => {
      const ms = service.getRefreshTokenExpiryMs();

      expect(ms).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('parseExpiryToSeconds - branches (lines 78, 82, 86)', () => {
    const buildService = (accessExpiry: string, refreshExpiry: string): TokenService => {
      return new TokenService({
        get: jest.fn((key: string, def?: string) => {
          const cfg: Record<string, string> = {
            'auth.jwt.secret': mockSecret,
            'auth.jwt.accessTokenExpiry': accessExpiry,
            'auth.jwt.refreshTokenExpiry': refreshExpiry,
          };
          return cfg[key] ?? def;
        }),
      } as unknown as ConfigService);
    };

    it('should parse seconds suffix "s" (line 78)', () => {
      const svc = buildService('30s', '1d');
      expect(svc.getAccessTokenExpirySeconds()).toBe(30);
    });

    it('should parse hours suffix "h" (line 82)', () => {
      const svc = buildService('2h', '1d');
      expect(svc.getAccessTokenExpirySeconds()).toBe(2 * 60 * 60);
    });

    it('should parse days suffix "d"', () => {
      const svc = buildService('1d', '7d');
      expect(svc.getAccessTokenExpirySeconds()).toBe(24 * 60 * 60);
    });

    it('should fallback to 900 seconds when format is invalid (line 86 / regex no-match)', () => {
      const svc = buildService('garbage', 'also-bad');
      expect(svc.getAccessTokenExpirySeconds()).toBe(900);
      expect(svc.getRefreshTokenExpiryMs()).toBe(900 * 1000);
    });
  });

  describe('verifyAccessToken - failure branches', () => {
    it('should throw for malformed token', () => {
      expect(() => service.verifyAccessToken('not.a.real.jwt')).toThrow();
    });

    it('should throw when access token is signed with a different secret', () => {
      const signed = (jest.requireActual('jsonwebtoken') as typeof import('jsonwebtoken')).sign(
        { sub: 'x', email: 'x@x', type: 'user' },
        'completely-different-secret',
        { expiresIn: 60 },
      );

      expect(() => service.verifyAccessToken(signed)).toThrow();
    });

    it('should throw TokenExpiredError when access token is expired', () => {
      const jwtLib = jest.requireActual('jsonwebtoken') as typeof import('jsonwebtoken');
      // sign with negative expiresIn -> already expired (issuer/audience must match)
      const expired = jwtLib.sign({ sub: 'x', email: 'x@x', type: 'user' }, mockSecret, {
        expiresIn: -10,
        algorithm: 'HS256',
        issuer: 'cyna-api',
        audience: 'cyna-clients',
      });

      expect(() => service.verifyAccessToken(expired)).toThrow(/expired/i);
    });
  });

  describe('verifyTempToken - failure branches', () => {
    it('should throw for malformed temp token', () => {
      expect(() => service.verifyTempToken('garbage')).toThrow();
    });

    it('should throw when temp token has expired', () => {
      const jwtLib = jest.requireActual('jsonwebtoken') as typeof import('jsonwebtoken');
      const expired = jwtLib.sign({ sub: 'x', email: 'x@x', purpose: '2fa' }, mockSecret, {
        expiresIn: -10,
        algorithm: 'HS256',
        issuer: 'cyna-api',
        audience: 'cyna-clients',
      });

      expect(() => service.verifyTempToken(expired)).toThrow(/expired/i);
    });
  });

  describe('hashToken - SHA-256 deterministic + matches known vector', () => {
    it('should hash to SHA-256 of input (matches Node crypto directly)', () => {
      const crypto = jest.requireActual('crypto') as typeof import('crypto');
      const expected = crypto.createHash('sha256').update('refresh-token-raw').digest('hex');
      expect(service.hashToken('refresh-token-raw')).toBe(expected);
    });

    it('should produce different hashes for different inputs', () => {
      const a = service.hashToken('token-a');
      const b = service.hashToken('token-b');
      expect(a).not.toBe(b);
    });
  });

  describe('constructor - JWT secret validation', () => {
    it('should throw when JWT secret is missing', () => {
      const cfg = {
        get: jest.fn((key: string, def?: string) => {
          if (key === 'auth.jwt.secret') return undefined;
          return def;
        }),
      } as unknown as ConfigService;

      expect(() => new TokenService(cfg)).toThrow('JWT_SECRET environment variable is required');
    });
  });
});
