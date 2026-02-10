import {
  IsNotEmpty,
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Language } from '@cyna-api/common';

export class CreateUserDto {
  @IsNotEmpty({ message: 'validation.email.required' })
  @IsEmail({}, { message: 'validation.email.invalid' })
  @MaxLength(255, { message: 'validation.email.maxLength' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MinLength(8, { message: 'validation.password.minLength' })
  @MaxLength(72, { message: 'validation.password.maxLength' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: 'validation.password.weak',
  })
  password: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  lastName: string;

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

  @IsOptional()
  @IsEnum(Language, { message: 'validation.enum.invalid' })
  preferredLanguage?: Language = Language.FR;
}
