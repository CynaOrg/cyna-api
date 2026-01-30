import { IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Language } from '@cyna-api/common';

export class CategoryQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Language for responses',
    enum: Language,
    default: Language.FR,
  })
  @IsOptional()
  @IsEnum(Language)
  lang?: Language = Language.FR;
}
