import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production-min-32-chars!!',
    accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d',
  },
  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  },
  twoFactor: {
    codeExpiryMinutes: parseInt(process.env.TWO_FACTOR_CODE_EXPIRY_MINUTES || '5', 10),
  },
  tokens: {
    emailVerificationExpiryHours: 24,
    passwordResetExpiryHours: 1,
    refreshTokenExpiryDays: 7,
  },
}));
