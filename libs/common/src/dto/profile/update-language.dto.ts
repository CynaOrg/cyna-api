import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Language } from '../../enums/language.enum';

export class UpdateLanguageDto {
  @ApiProperty({
    description: 'Preferred language',
    enum: Language,
    example: Language.FR,
  })
  @IsNotEmpty({ message: 'validation.string.required' })
  @IsEnum(Language, { message: 'validation.enum.invalid' })
  preferredLanguage: Language;
}
