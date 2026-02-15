import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Trims a string and converts empty strings to undefined
 */
const trimOrUndefined = ({ value }: { value: unknown }): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'First name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(trimOrUndefined)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(trimOrUndefined)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Company name', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  @Transform(trimOrUndefined)
  companyName?: string;

  @ApiPropertyOptional({ description: 'VAT number', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'validation.string.maxLength' })
  @Transform(trimOrUndefined)
  vatNumber?: string;
}