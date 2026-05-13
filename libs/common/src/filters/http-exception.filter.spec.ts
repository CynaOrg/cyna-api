import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  BadRequestException as NestBadRequestException,
} from '@nestjs/common';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { GlobalExceptionFilter } from './http-exception.filter';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  TooManyRequestsException,
  TokenExpiredException,
} from '../exceptions';
import { ERROR_CODES } from '../exceptions/error-codes';

interface MockResponse {
  status: jest.Mock;
  json: jest.Mock;
}

const buildHost = (
  request: Partial<{ url: string; method: string }> = {},
): { host: ArgumentsHost; response: MockResponse } => {
  const response: MockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/api/test', method: 'GET', ...request }),
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
};

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let i18n: { translate: jest.Mock };

  beforeEach(() => {
    i18n = {
      translate: jest.fn((key: string) => Promise.resolve(`[FR] ${key}`)),
    };
    filter = new GlobalExceptionFilter(i18n as unknown as I18nService);
    jest.spyOn(I18nContext, 'current').mockReturnValue({ lang: 'fr' } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('BaseException (custom business)', () => {
    it('should translate i18n key and return formatted response', async () => {
      const { host, response } = buildHost();

      await filter.catch(new TokenExpiredException(), host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(i18n.translate).toHaveBeenCalledWith(
        'errors.auth.tokenExpired',
        expect.objectContaining({ lang: 'fr' }),
      );
      const payload = response.json.mock.calls[0][0];
      expect(payload.error.code).toBe(ERROR_CODES.AUTH_TOKEN_EXPIRED);
      expect(payload.error.message).toBe('[FR] errors.auth.tokenExpired');
      expect(payload.meta).toEqual(
        expect.objectContaining({
          path: '/api/test',
          requestId: expect.any(String),
          timestamp: expect.any(String),
        }),
      );
    });

    it('should include details on BaseException when present', async () => {
      const { host, response } = buildHost();
      const exc = new BadRequestException(ERROR_CODES.BAD_REQUEST, 'errors.common.bad_request', [
        { field: 'email', message: 'invalid' },
      ]);

      await filter.catch(exc, host);

      const payload = response.json.mock.calls[0][0];
      expect(payload.error.details).toEqual([{ field: 'email', message: 'invalid' }]);
    });
  });

  describe('RpcException-shaped errors from microservices', () => {
    it('should translate when message looks like an i18n key (contains a dot)', async () => {
      const { host, response } = buildHost();
      const rpcLike = { statusCode: 400, message: 'errors.cart.empty', code: 'CART_EMPTY' };

      await filter.catch(rpcLike, host);

      expect(response.status).toHaveBeenCalledWith(400);
      expect(i18n.translate).toHaveBeenCalledWith(
        'errors.cart.empty',
        expect.objectContaining({ lang: 'fr' }),
      );
      const payload = response.json.mock.calls[0][0];
      expect(payload.error.code).toBe('CART_EMPTY');
      expect(payload.error.message).toBe('[FR] errors.cart.empty');
    });

    it('should NOT translate plain English message (no dot)', async () => {
      const { host, response } = buildHost();
      const rpcLike = { statusCode: 503, message: 'Order service timeout' };

      await filter.catch(rpcLike, host);

      expect(response.status).toHaveBeenCalledWith(503);
      expect(i18n.translate).not.toHaveBeenCalled();
      const payload = response.json.mock.calls[0][0];
      expect(payload.error.message).toBe('Order service timeout');
      expect(payload.error.code).toBe(ERROR_CODES.SERVICE_UNAVAILABLE);
    });

    it('should fall back gracefully when message contains a dot but key is unknown (returns the key)', async () => {
      const { host, response } = buildHost();
      i18n.translate.mockRejectedValueOnce(new Error('translation missing'));
      const rpcLike = { statusCode: 422, message: 'errors.unknown.bogus.key' };

      await filter.catch(rpcLike, host);

      const payload = response.json.mock.calls[0][0];
      // Filter catches translation errors and returns the key as fallback
      expect(payload.error.message).toBe('errors.unknown.bogus.key');
      expect(payload.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('should derive the error code from status when not provided', async () => {
      const { host, response } = buildHost();
      const rpcLike = { statusCode: 404, message: 'Not here' };

      await filter.catch(rpcLike, host);

      const payload = response.json.mock.calls[0][0];
      expect(payload.error.code).toBe(ERROR_CODES.NOT_FOUND);
    });
  });

  describe('Standard HttpException', () => {
    it('should return status + simple string message untranslated (no dot)', async () => {
      const { host, response } = buildHost();
      const exc = new HttpException('Unprocessable', HttpStatus.UNPROCESSABLE_ENTITY);

      await filter.catch(exc, host);

      expect(response.status).toHaveBeenCalledWith(422);
      const payload = response.json.mock.calls[0][0];
      expect(payload.error.message).toBe('Unprocessable');
      expect(payload.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('should translate string message containing a dot via i18n', async () => {
      const { host, response } = buildHost();
      const exc = new HttpException(
        { message: 'errors.common.internal' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      await filter.catch(exc, host);

      expect(i18n.translate).toHaveBeenCalledWith(
        'errors.common.internal',
        expect.objectContaining({ lang: 'fr' }),
      );
    });

    it('should format ValidationPipe-style array of messages as details[]', async () => {
      const { host, response } = buildHost();
      const exc = new NestBadRequestException({
        message: ['email must be an email', 'password is too short'],
        error: 'Bad Request',
      });

      await filter.catch(exc, host);

      expect(response.status).toHaveBeenCalledWith(400);
      const payload = response.json.mock.calls[0][0];
      expect(payload.error.details).toEqual([
        { message: 'email must be an email' },
        { message: 'password is too short' },
      ]);
      // First message used as the top-level message
      expect(payload.error.message).toBe('email must be an email');
    });

    it('should map ForbiddenException to FORBIDDEN code', async () => {
      const { host, response } = buildHost();
      const exc = new ForbiddenException(ERROR_CODES.FORBIDDEN, 'forbidden');

      await filter.catch(exc, host);

      const payload = response.json.mock.calls[0][0];
      expect(response.status).toHaveBeenCalledWith(403);
      expect(payload.error.code).toBe(ERROR_CODES.FORBIDDEN);
    });

    it('should map NotFoundException to NOT_FOUND code', async () => {
      const { host, response } = buildHost();
      const exc = new NotFoundException(ERROR_CODES.NOT_FOUND, 'not found');

      await filter.catch(exc, host);

      expect(response.status).toHaveBeenCalledWith(404);
    });
  });

  describe('Throttler / Too many requests', () => {
    it('should return 429 with TOO_MANY_REQUESTS code for TooManyRequestsException', async () => {
      const { host, response } = buildHost();
      const exc = new TooManyRequestsException(
        ERROR_CODES.TOO_MANY_REQUESTS,
        'errors.common.tooManyRequests',
      );

      await filter.catch(exc, host);

      expect(response.status).toHaveBeenCalledWith(429);
      const payload = response.json.mock.calls[0][0];
      expect(payload.error.code).toBe(ERROR_CODES.TOO_MANY_REQUESTS);
      expect(i18n.translate).toHaveBeenCalledWith(
        'errors.common.tooManyRequests',
        expect.objectContaining({ lang: 'fr' }),
      );
    });

    it('should return 429 for a NestJS HttpException at status 429 without a dot in message', async () => {
      const { host, response } = buildHost();
      const exc = new HttpException('ThrottlerException: Too Many Requests', 429);

      await filter.catch(exc, host);

      expect(response.status).toHaveBeenCalledWith(429);
    });
  });

  describe('Unknown errors / generic Error', () => {
    it('should return 500 INTERNAL_ERROR for plain Error instance', async () => {
      const { host, response } = buildHost();
      const loggerSpy = jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

      await filter.catch(new Error('boom'), host);

      expect(response.status).toHaveBeenCalledWith(500);
      const payload = response.json.mock.calls[0][0];
      expect(payload.error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(payload.error.message).toBe('[FR] errors.common.internal');
      // Stack is logged server-side, NOT exposed in response
      expect(payload.error.stack).toBeUndefined();
      expect(loggerSpy).toHaveBeenCalled();
    });

    it('should return 500 INTERNAL_ERROR for a plain object that is not an HttpException', async () => {
      const { host, response } = buildHost();
      jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

      await filter.catch({ random: 'thing' }, host);

      expect(response.status).toHaveBeenCalledWith(500);
      const payload = response.json.mock.calls[0][0];
      expect(payload.error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    });

    it('should not leak the stack trace in the JSON response', async () => {
      const { host, response } = buildHost();
      jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
      const err = new Error('sensitive internals leak');

      await filter.catch(err, host);

      const payload = response.json.mock.calls[0][0];
      expect(JSON.stringify(payload)).not.toContain('sensitive internals leak');
    });
  });

  describe('language resolution', () => {
    it('should default to "fr" when I18nContext.current returns undefined', async () => {
      jest.spyOn(I18nContext, 'current').mockReturnValue(undefined as never);
      const { host } = buildHost();

      await filter.catch(new TokenExpiredException(), host);

      expect(i18n.translate).toHaveBeenCalledWith(
        'errors.auth.tokenExpired',
        expect.objectContaining({ lang: 'fr' }),
      );
    });

    it('should use language from I18nContext when present (e.g. "en")', async () => {
      jest.spyOn(I18nContext, 'current').mockReturnValue({ lang: 'en' } as never);
      const { host } = buildHost();

      await filter.catch(new TokenExpiredException(), host);

      expect(i18n.translate).toHaveBeenCalledWith(
        'errors.auth.tokenExpired',
        expect.objectContaining({ lang: 'en' }),
      );
    });
  });

  describe('response envelope shape', () => {
    it('should include meta.timestamp (ISO), meta.requestId, meta.path', async () => {
      const { host, response } = buildHost({ url: '/api/users/me' });

      await filter.catch(new TokenExpiredException(), host);

      const payload = response.json.mock.calls[0][0];
      expect(payload.meta.path).toBe('/api/users/me');
      expect(payload.meta.requestId).toMatch(/^req_/);
      expect(() => new Date(payload.meta.timestamp).toISOString()).not.toThrow();
    });
  });
});
