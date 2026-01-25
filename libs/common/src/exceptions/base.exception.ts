import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface ExceptionDetails {
  field?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Base Exception
 * All custom exceptions should extend this class
 */
export class BaseException extends HttpException {
  public readonly code: ErrorCode;
  public readonly messageKey: string;
  public readonly details?: ExceptionDetails[];

  constructor(
    code: ErrorCode,
    messageKey: string,
    httpStatus: HttpStatus,
    details?: ExceptionDetails[],
  ) {
    super(
      {
        code,
        messageKey,
        details,
      },
      httpStatus,
    );

    this.code = code;
    this.messageKey = messageKey;
    this.details = details;
  }
}

/**
 * Bad Request Exception (400)
 */
export class BadRequestException extends BaseException {
  constructor(code: ErrorCode, messageKey: string, details?: ExceptionDetails[]) {
    super(code, messageKey, HttpStatus.BAD_REQUEST, details);
  }
}

/**
 * Unauthorized Exception (401)
 */
export class UnauthorizedException extends BaseException {
  constructor(code: ErrorCode, messageKey: string, details?: ExceptionDetails[]) {
    super(code, messageKey, HttpStatus.UNAUTHORIZED, details);
  }
}

/**
 * Forbidden Exception (403)
 */
export class ForbiddenException extends BaseException {
  constructor(code: ErrorCode, messageKey: string, details?: ExceptionDetails[]) {
    super(code, messageKey, HttpStatus.FORBIDDEN, details);
  }
}

/**
 * Not Found Exception (404)
 */
export class NotFoundException extends BaseException {
  constructor(code: ErrorCode, messageKey: string, details?: ExceptionDetails[]) {
    super(code, messageKey, HttpStatus.NOT_FOUND, details);
  }
}

/**
 * Conflict Exception (409)
 */
export class ConflictException extends BaseException {
  constructor(code: ErrorCode, messageKey: string, details?: ExceptionDetails[]) {
    super(code, messageKey, HttpStatus.CONFLICT, details);
  }
}

/**
 * Unprocessable Entity Exception (422)
 */
export class UnprocessableEntityException extends BaseException {
  constructor(code: ErrorCode, messageKey: string, details?: ExceptionDetails[]) {
    super(code, messageKey, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

/**
 * Too Many Requests Exception (429)
 */
export class TooManyRequestsException extends BaseException {
  constructor(code: ErrorCode, messageKey: string, details?: ExceptionDetails[]) {
    super(code, messageKey, HttpStatus.TOO_MANY_REQUESTS, details);
  }
}

/**
 * Internal Server Error Exception (500)
 */
export class InternalServerErrorException extends BaseException {
  constructor(code: ErrorCode, messageKey: string, details?: ExceptionDetails[]) {
    super(code, messageKey, HttpStatus.INTERNAL_SERVER_ERROR, details);
  }
}

/**
 * Service Unavailable Exception (503)
 */
export class ServiceUnavailableException extends BaseException {
  constructor(code: ErrorCode, messageKey: string, details?: ExceptionDetails[]) {
    super(code, messageKey, HttpStatus.SERVICE_UNAVAILABLE, details);
  }
}
