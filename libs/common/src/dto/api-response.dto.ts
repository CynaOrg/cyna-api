import { PaginationResponseDto } from './pagination.dto';

/**
 * API Response Meta DTO
 */
export class ApiResponseMetaDto {
  timestamp: string;
  requestId: string;

  constructor(requestId: string) {
    this.timestamp = new Date().toISOString();
    this.requestId = requestId;
  }
}

/**
 * API Response DTO
 * Standard response wrapper for all successful responses
 */
export class ApiResponseDto<T> {
  data: T;
  meta: ApiResponseMetaDto;

  constructor(data: T, requestId: string) {
    this.data = data;
    this.meta = new ApiResponseMetaDto(requestId);
  }
}

/**
 * Paginated API Response DTO
 */
export class PaginatedApiResponseDto<T> extends ApiResponseDto<T[]> {
  pagination: PaginationResponseDto;

  constructor(data: T[], pagination: PaginationResponseDto, requestId: string) {
    super(data, requestId);
    this.pagination = pagination;
  }
}

/**
 * Error Detail DTO
 */
export class ErrorDetailDto {
  field?: string;
  message: string;

  constructor(message: string, field?: string) {
    this.message = message;
    if (field) {
      this.field = field;
    }
  }
}

/**
 * Error Response DTO
 * Standard response wrapper for all error responses
 */
export class ErrorResponseDto {
  error: {
    code: string;
    message: string;
    details?: ErrorDetailDto[];
  };
  meta: ApiResponseMetaDto;

  constructor(
    code: string,
    message: string,
    requestId: string,
    details?: ErrorDetailDto[],
  ) {
    this.error = {
      code,
      message,
      ...(details && { details }),
    };
    this.meta = new ApiResponseMetaDto(requestId);
  }
}

/**
 * Helper to create API response
 */
export function createApiResponse<T>(data: T, requestId: string): ApiResponseDto<T> {
  return new ApiResponseDto(data, requestId);
}

/**
 * Helper to create paginated API response
 */
export function createPaginatedApiResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
  requestId: string,
): PaginatedApiResponseDto<T> {
  const pagination = new PaginationResponseDto(page, limit, total);
  return new PaginatedApiResponseDto(data, pagination, requestId);
}
