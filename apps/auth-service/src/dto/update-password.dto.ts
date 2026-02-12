import { IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class UpdatePasswordDto {
  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  currentPassword: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MinLength(8, { message: 'validation.password.minLength' })
  @MaxLength(72, { message: 'validation.password.maxLength' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: 'validation.password.weak',
  })
  newPassword: string;
}
