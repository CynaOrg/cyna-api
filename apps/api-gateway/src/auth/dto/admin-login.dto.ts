import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@cyna.io', description: 'Admin email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'AdminPassword123!', description: 'Admin password' })
  @IsString()
  @MinLength(1)
  password: string;
}
