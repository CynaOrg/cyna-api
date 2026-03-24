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
 * Transform Interceptor
 * Wraps all successful responses in a standard format
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const correlationId = getCorrelationId() || `req_${Date.now().toString(36)}`;

    return next.handle().pipe(
      map((data) => {
        // If data is already in the correct format (has data and meta), return as-is
        if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
          return data as ApiResponse<T>;
        }

        // If data has pagination info, preserve it
        if (data && typeof data === 'object' && 'pagination' in data) {
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
          data,
          meta: {
            timestamp: new Date().toISOString(),
            requestId: correlationId,
          },
        };
      }),
    );
  }
}
