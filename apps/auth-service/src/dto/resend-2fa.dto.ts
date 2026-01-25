import { IsNotEmpty, IsString } from 'class-validator';

export class Resend2FADto {
  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  tempToken: string;
}
