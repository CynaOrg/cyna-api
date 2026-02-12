import { IsEnum, IsNotEmpty } from 'class-validator';
import { Language } from '@cyna-api/common';

export class UpdateLanguageDto {
  @IsNotEmpty()
  @IsEnum(Language)
  preferredLanguage: Language;
}
