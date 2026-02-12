import { IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class ContactMessageQueryDto {
  @IsOptional()
  @IsInt({ message: 'validation.page.invalid' })
  @Min(1, { message: 'validation.page.min' })
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 1))
  page?: number = 1;

  @IsOptional()
  @IsInt({ message: 'validation.limit.invalid' })
  @Min(1, { message: 'validation.limit.min' })
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 10))
  limit?: number = 10;

  @IsOptional()
  @IsBoolean({ message: 'validation.isRead.invalid' })
  isRead?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'validation.isProcessed.invalid' })
  isProcessed?: boolean;
}
