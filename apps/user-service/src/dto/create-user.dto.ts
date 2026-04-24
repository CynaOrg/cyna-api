import { IsEmail, IsString, IsOptional, IsEnum, Matches, MaxLength } from 'class-validator';
import { Language } from '@cyna-api/common';

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$.{53}$/;

export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @Matches(BCRYPT_HASH_PATTERN, { message: 'passwordHash must be a valid bcrypt hash' })
  passwordHash: string;

  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vatNumber?: string;

  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;
}
