import { IsNotEmpty, IsEmail, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class AdminLoginDto {
  @IsNotEmpty({ message: 'validation.email.required' })
  @IsEmail({}, { message: 'validation.email.invalid' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  password: string;
}
