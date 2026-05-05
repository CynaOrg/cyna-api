import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { TransformInterceptor, ApiResponse } from './transform.interceptor';

jest.mock('@cyna-api/common/logger', () => ({
  getCorrelationId: (): string => 'test-correlation-id',
}));

interface PaginatedShape {
  data: unknown[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

const mockExecutionContext = {} as ExecutionContext;

function makeHandler<T>(value: T): CallHandler {
  return {
    handle: () => of(value),
  } as CallHandler;
}

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('wraps a plain array in the standard envelope', async () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const handler = makeHandler(items);

    const result = (await lastValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    )) as ApiResponse<unknown>;

    expect(result.data).toEqual(items);
    expect(result.meta.requestId).toBe('test-correlation-id');
    expect(typeof result.meta.timestamp).toBe('string');
  });

  it('wraps a plain object in the standard envelope', async () => {
    const payload = { id: 'x', name: 'foo' };
    const handler = makeHandler(payload);

    const result = (await lastValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    )) as ApiResponse<unknown>;

    expect(result.data).toEqual(payload);
    expect(result.meta.requestId).toBe('test-correlation-id');
  });

  it('unwraps a pre-paginated microservice response and fills meta', async () => {
    const microserviceResponse = {
      data: [{ id: 'order-1' }, { id: 'order-2' }],
      total: 25,
      page: 2,
      limit: 10,
      totalPages: 3,
    };
    const handler = makeHandler(microserviceResponse);

    const result = (await lastValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    )) as unknown as PaginatedShape;

    expect(result.data).toEqual(microserviceResponse.data);
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
    expect(result.meta.requestId).toBe('test-correlation-id');
    // Crucially, no double wrapping: the data field is NOT itself a pre-paginated object.
    expect(result.data).not.toHaveProperty('data');
    expect(result.data).not.toHaveProperty('total');
  });

  it('computes hasNext/hasPrev correctly for first page', async () => {
    const handler = makeHandler({
      data: [{ id: 'a' }],
      total: 5,
      page: 1,
      limit: 2,
      totalPages: 3,
    });

    const result = (await lastValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    )) as unknown as PaginatedShape;

    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.hasPrev).toBe(false);
  });

  it('computes hasNext/hasPrev correctly for last page', async () => {
    const handler = makeHandler({
      data: [{ id: 'a' }],
      total: 5,
      page: 3,
      limit: 2,
      totalPages: 3,
    });

    const result = (await lastValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    )) as unknown as PaginatedShape;

    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(true);
  });

  it('returns an already-shaped {data, meta} response unchanged', async () => {
    const alreadyShaped = {
      data: { id: 'x' },
      meta: {
        timestamp: '2026-01-01T00:00:00.000Z',
        requestId: 'preset-id',
      },
    };
    const handler = makeHandler(alreadyShaped);

    const result = (await lastValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    )) as ApiResponse<unknown>;

    expect(result).toBe(alreadyShaped);
  });

  it('preserves an existing pagination envelope and adds meta', async () => {
    const handler = makeHandler({
      data: [{ id: 'a' }],
      pagination: {
        page: 1,
        limit: 1,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    });

    const result = (await lastValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    )) as unknown as PaginatedShape;

    expect(result.data).toEqual([{ id: 'a' }]);
    expect(result.pagination.totalPages).toBe(1);
    expect(result.meta.requestId).toBe('test-correlation-id');
  });
});
