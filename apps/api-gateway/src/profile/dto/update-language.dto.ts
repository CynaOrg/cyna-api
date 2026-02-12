import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Language } from '@cyna-api/common';

export class UpdateLanguageDto {
  @ApiProperty({
    description: 'Preferred language',
    enum: Language,
    example: Language.FR,
  })
  @IsNotEmpty()
  @IsEnum(Language)
  preferredLanguage: Language;
}
