import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { getCorrelationId } from '@cyna-api/common/logger';

/**
 * Standard API Response structure
 */
export interface ApiResponse<T> {
  data: T;
  meta: {
    timestamp: string;
    requestId: string;
  };
}

/**
 * Paginated API Response structure
 */
export interface PaginatedApiResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Shape returned by microservices that already paginated the result.
 * Detected by the 5 characteristic keys: data (array), total, page, limit, totalPages.
 */
interface PrePaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPrePaginatedResponse(value: unknown): value is PrePaginatedResponse<unknown> {
  if (!isRecord(value)) {
    return false;
  }
  return (
    Array.isArray(value.data) &&
    typeof value.total === 'number' &&
    typeof value.page === 'number' &&
    typeof value.limit === 'number' &&
    typeof value.totalPages === 'number'
  );
}

/**
 * Transform Interceptor
 * Wraps all successful responses in a standard format
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const correlationId = getCorrelationId() || `req_${Date.now().toString(36)}`;

    return next.handle().pipe(
      map((data: unknown): ApiResponse<T> => {
        // If data is already in the correct format (has data and meta), return as-is
        if (isRecord(data) && 'data' in data && 'meta' in data) {
          return data as unknown as ApiResponse<T>;
        }

        // If data is a pre-paginated microservice response, unwrap and convert to
        // the standard pagination envelope. This prevents double-wrapping where the
        // frontend would otherwise need to do `response.data.data`.
        if (isPrePaginatedResponse(data)) {
          const { data: items, total, page, limit, totalPages } = data;
          return {
            data: items,
            pagination: {
              page,
              limit,
              total,
              totalPages,
              hasNext: page < totalPages,
              hasPrev: page > 1,
            },
            meta: {
              timestamp: new Date().toISOString(),
              requestId: correlationId,
            },
          } as unknown as ApiResponse<T>;
        }

        // If data has pagination info already shaped, preserve it
        if (isRecord(data) && 'pagination' in data && 'data' in data) {
          return {
            data: data.data,
            pagination: data.pagination,
            meta: {
              timestamp: new Date().toISOString(),
              requestId: correlationId,
            },
          } as unknown as ApiResponse<T>;
        }

        // Standard transformation
        return {
          data: data as T,
          meta: {
            timestamp: new Date().toISOString(),
            requestId: correlationId,
          },
        };
      }),
    );
  }
}
