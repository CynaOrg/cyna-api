import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { I18nService, I18nContext } from 'nestjs-i18n';
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
 * Detect strings shaped like i18n keys: at least one dot, no whitespace,
 * starts with a lowercase letter, and looks like dotted.path.notation.
 * Matches keys like 'common.messages.registrationSuccess' or
 * 'errors.auth.invalidCredentials' but skips real sentences with periods.
 */
const I18N_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/;

function looksLikeI18nKey(value: string): boolean {
  return I18N_KEY_PATTERN.test(value);
}

/**
 * Transform Interceptor
 * Wraps all successful responses in a standard format. When an I18nService is
 * provided, recursively translates any `message` field that looks like an i18n
 * key (e.g. 'common.messages.registrationSuccess') so success responses are
 * localized the same way errors are by GlobalExceptionFilter.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly i18n?: I18nService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const correlationId = getCorrelationId() || `req_${Date.now().toString(36)}`;
    // I18nContext.current expects a real ExecutionContext; tests inject an empty
    // mock so guard against a runtime error there. Default to 'fr' when missing.
    let lang = 'fr';
    try {
      lang = I18nContext.current(context)?.lang || 'fr';
    } catch {
      // No-op: fall back to the default language.
    }

    return next
      .handle()
      .pipe(
        mergeMap(
          (data: unknown): Promise<ApiResponse<T>> => this.transform(data, correlationId, lang),
        ),
      );
  }

  private async transform(
    data: unknown,
    correlationId: string,
    lang: string,
  ): Promise<ApiResponse<T>> {
    // If data is already in the correct format (has data and meta), still
    // translate any embedded keys but return its outer shape.
    if (isRecord(data) && 'data' in data && 'meta' in data) {
      await this.translateInPlace(data, lang);
      return data as unknown as ApiResponse<T>;
    }

    // Translate i18n keys anywhere inside the payload before wrapping.
    await this.translateInPlace(data, lang);

    // If data is a pre-paginated microservice response, unwrap and convert.
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
  }

  /**
   * Walk a payload and translate any string that looks like an i18n key.
   * In-place mutation is acceptable here because the value comes straight
   * from a microservice handler and has no other consumer in the request
   * lifecycle. Guards against cycles and limits depth to a sane value.
   */
  private async translateInPlace(value: unknown, lang: string, depth = 0): Promise<void> {
    if (!this.i18n || value === null || value === undefined || depth > 5) {
      return;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'string' && looksLikeI18nKey(item)) {
          value[i] = await this.translateKey(item, lang);
        } else if (isRecord(item) || Array.isArray(item)) {
          await this.translateInPlace(item, lang, depth + 1);
        }
      }
      return;
    }

    if (isRecord(value)) {
      for (const key of Object.keys(value)) {
        const v = value[key];
        if (typeof v === 'string' && looksLikeI18nKey(v)) {
          value[key] = await this.translateKey(v, lang);
        } else if (isRecord(v) || Array.isArray(v)) {
          await this.translateInPlace(v, lang, depth + 1);
        }
      }
    }
  }

  private async translateKey(key: string, lang: string): Promise<string> {
    try {
      const translated = await this.i18n!.translate(key, { lang });
      // i18nService.translate returns the key when not found — keep falling
      // back gracefully in that case rather than throwing.
      return typeof translated === 'string' ? translated : key;
    } catch {
      return key;
    }
  }
}
