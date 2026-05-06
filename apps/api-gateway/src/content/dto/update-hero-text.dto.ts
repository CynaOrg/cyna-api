import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * UpdateHeroTextDto - all fields optional so partial updates work.
 * Mirror of `apps/content-service/src/dto/hero-text/update-hero-text.dto.ts`.
 */
export class UpdateHeroTextDto {
  @ApiPropertyOptional({ description: 'Hero title in French', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  titleFr?: string;

  @ApiPropertyOptional({ description: 'Hero title in English', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  titleEn?: string;

  @ApiPropertyOptional({ description: 'Hero subtitle in French', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitleFr?: string;

  @ApiPropertyOptional({ description: 'Hero subtitle in English', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitleEn?: string;
}
