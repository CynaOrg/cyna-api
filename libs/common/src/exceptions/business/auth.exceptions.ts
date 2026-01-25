import { UnauthorizedException, ForbiddenException } from '../base.exception';
import { ERROR_CODES } from '../error-codes';

/**
 * Auth Exceptions
 */

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'errors.auth.invalidCredentials');
  }
}

export class EmailNotVerifiedException extends ForbiddenException {
  constructor() {
    super(ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED, 'errors.auth.emailNotVerified');
  }
}

export class AccountDisabledException extends ForbiddenException {
  constructor() {
    super(ERROR_CODES.AUTH_ACCOUNT_DISABLED, 'errors.auth.accountDisabled');
  }
}

export class TokenExpiredException extends UnauthorizedException {
  constructor() {
    super(ERROR_CODES.AUTH_TOKEN_EXPIRED, 'errors.auth.tokenExpired');
  }
}

export class TokenInvalidException extends UnauthorizedException {
  constructor() {
    super(ERROR_CODES.AUTH_TOKEN_INVALID, 'errors.auth.tokenInvalid');
  }
}

export class TwoFactorRequiredException extends UnauthorizedException {
  constructor() {
    super(ERROR_CODES.AUTH_2FA_REQUIRED, 'errors.auth.2faRequired');
  }
}

export class TwoFactorInvalidException extends UnauthorizedException {
  constructor() {
    super(ERROR_CODES.AUTH_2FA_INVALID, 'errors.auth.2faInvalid');
  }
}

export class TwoFactorExpiredException extends UnauthorizedException {
  constructor() {
    super(ERROR_CODES.AUTH_2FA_EXPIRED, 'errors.auth.2faExpired');
  }
}

export class RefreshTokenInvalidException extends UnauthorizedException {
  constructor() {
    super(ERROR_CODES.AUTH_REFRESH_TOKEN_INVALID, 'errors.auth.refreshTokenInvalid');
  }
}
