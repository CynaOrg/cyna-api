import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateHeroTextDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'validation.titleFr.maxLength' })
  @Transform(({ value }) => value?.trim())
  titleFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'validation.titleEn.maxLength' })
  @Transform(({ value }) => value?.trim())
  titleEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'validation.subtitleFr.maxLength' })
  @Transform(({ value }) => value?.trim())
  subtitleFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'validation.subtitleEn.maxLength' })
  @Transform(({ value }) => value?.trim())
  subtitleEn?: string;
}
