import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  vatNumber?: string;
}
