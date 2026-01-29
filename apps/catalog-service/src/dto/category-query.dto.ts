import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { Language } from '@cyna-api/common';

export class CategoryQueryDto {
  @IsOptional()
  @IsEnum(Language)
  lang?: Language;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean = true;
}
