import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class Verify2FADto {
  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  tempToken: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @Length(6, 6, { message: 'validation.code2fa.invalid' })
  @Matches(/^\d{6}$/, { message: 'validation.code2fa.invalid' })
  code: string;
}
