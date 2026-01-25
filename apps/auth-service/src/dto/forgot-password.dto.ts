import { IsNotEmpty, IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';

export class ForgotPasswordDto {
  @IsNotEmpty({ message: 'validation.email.required' })
  @IsEmail({}, { message: 'validation.email.invalid' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}
