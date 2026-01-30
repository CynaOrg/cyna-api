import { IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { Language } from '@cyna-api/common';

export class CategoryQueryDto {
  @IsOptional()
  @IsBoolean({ message: 'validation.isActive.invalid' })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isActive?: boolean;

  @IsOptional()
  @IsEnum(Language, { message: 'validation.lang.invalid' })
  lang?: Language = Language.FR;
}
