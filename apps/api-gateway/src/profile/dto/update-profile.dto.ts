import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'First name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  lastName?: string;

  @ApiPropertyOptional({ description: 'Company name', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  companyName?: string;

  @ApiPropertyOptional({ description: 'VAT number', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  vatNumber?: string;
}
