import { IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: 'New password (min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char)',
  })
  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MinLength(8, { message: 'validation.password.minLength' })
  @MaxLength(72, { message: 'validation.password.maxLength' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: 'validation.password.weak',
  })
  newPassword: string;
}
