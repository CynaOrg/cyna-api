import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { BaseException } from '@cyna/common/exceptions';
import { ERROR_CODES } from '@cyna/common/exceptions';
import { getCorrelationId } from '@cyna/common/logger';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message?: string; [key: string]: unknown }>;
  };
  meta: {
    timestamp: string;
    requestId: string;
    path: string;
  };
}

/**
 * Global HTTP Exception Filter
 * Catches all exceptions and formats them consistently with i18n support
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly i18n: I18nService) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const i18nContext = I18nContext.current(host);
    const lang = i18nContext?.lang || 'fr';

    let status: number;
    let code: string;
    let message: string;
    let details: Array<{ field?: string; message?: string; [key: string]: unknown }> | undefined;

    if (exception instanceof BaseException) {
      // Custom business exception
      status = exception.getStatus();
      code = exception.code;
      message = await this.translateMessage(exception.messageKey, lang, exception.details);
      details = exception.details;
    } else if (exception instanceof HttpException) {
      // NestJS HTTP exception
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        code = (resp.error as string) || this.getErrorCodeFromStatus(status);
        message = await this.getMessageFromResponse(resp, lang);
        details = resp.message && Array.isArray(resp.message)
          ? resp.message.map((msg: string) => ({ message: msg }))
          : undefined;
      } else {
        code = this.getErrorCodeFromStatus(status);
        message = String(exceptionResponse);
      }
    } else {
      // Unknown error
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = ERROR_CODES.INTERNAL_ERROR;
      message = await this.translateMessage('errors.common.internal', lang);

      // Log unexpected errors
      this.logger.error(
        `Unexpected error: ${exception instanceof Error ? exception.message : 'Unknown'}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const correlationId = getCorrelationId() || `req_${Date.now().toString(36)}`;

    const errorResponse: ErrorResponse = {
      error: {
        code,
        message,
        ...(details && { details }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: correlationId,
        path: request.url,
      },
    };

    // Log error
    this.logger.warn(
      `${request.method} ${request.url} ${status} - ${code}: ${message}`,
      { correlationId, code, status },
    );

    response.status(status).json(errorResponse);
  }

  /**
   * Translate a message key using i18n
   */
  private async translateMessage(
    key: string,
    lang: string,
    args?: Record<string, unknown>[] | Record<string, unknown>,
  ): Promise<string> {
    try {
      const translationArgs = Array.isArray(args) && args.length > 0 ? args[0] : args;
      return await this.i18n.translate(key, {
        lang,
        args: translationArgs as Record<string, unknown>,
      });
    } catch {
      return key;
    }
  }

  /**
   * Get message from NestJS exception response
   */
  private async getMessageFromResponse(
    response: Record<string, unknown>,
    lang: string,
  ): Promise<string> {
    const message = response.message;

    if (typeof message === 'string') {
      // Try to translate if it looks like a key
      if (message.includes('.')) {
        return await this.translateMessage(message, lang);
      }
      return message;
    }

    if (Array.isArray(message) && message.length > 0) {
      return String(message[0]);
    }

    return await this.translateMessage('errors.common.internal', lang);
  }

  /**
   * Get error code from HTTP status
   */
  private getErrorCodeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.CONFLICT;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ERROR_CODES.VALIDATION_ERROR;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.TOO_MANY_REQUESTS;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ERROR_CODES.SERVICE_UNAVAILABLE;
      default:
        return ERROR_CODES.INTERNAL_ERROR;
    }
  }
}
