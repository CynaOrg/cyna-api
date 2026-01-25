import { IsOptional, IsInt, Min, Max, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Pagination Query DTO
 * Used for paginated list endpoints
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

/**
 * Pagination Response DTO
 * Included in paginated responses
 */
export class PaginationResponseDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;

  constructor(page: number, limit: number, total: number) {
    this.page = page;
    this.limit = limit;
    this.total = total;
    this.totalPages = Math.ceil(total / limit);
    this.hasNext = page < this.totalPages;
    this.hasPrev = page > 1;
  }
}

/**
 * Helper function to create pagination response
 */
export function createPaginationResponse(
  page: number,
  limit: number,
  total: number,
): PaginationResponseDto {
  return new PaginationResponseDto(page, limit, total);
}
