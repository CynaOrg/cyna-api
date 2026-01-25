import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  token: string;
}
