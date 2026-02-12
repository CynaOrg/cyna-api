import { IsNotEmpty, IsString, IsEmail, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateContactMessageDto {
  @IsNotEmpty({ message: 'validation.name.required' })
  @IsString()
  @MaxLength(200, { message: 'validation.name.maxLength' })
  @Transform(({ value }) => value?.trim())
  name: string;

  @IsNotEmpty({ message: 'validation.email.required' })
  @IsEmail({}, { message: 'validation.email.invalid' })
  @MaxLength(255, { message: 'validation.email.maxLength' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty({ message: 'validation.subject.required' })
  @IsString()
  @MaxLength(300, { message: 'validation.subject.maxLength' })
  @Transform(({ value }) => value?.trim())
  subject: string;

  @IsNotEmpty({ message: 'validation.message.required' })
  @IsString()
  @MinLength(10, { message: 'validation.message.minLength' })
  @MaxLength(5000, { message: 'validation.message.maxLength' })
  @Transform(({ value }) => value?.trim())
  message: string;
}
