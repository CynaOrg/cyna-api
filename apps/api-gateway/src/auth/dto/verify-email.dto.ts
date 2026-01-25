import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ example: 'verification-token', description: 'Email verification token' })
  @IsString()
  @MinLength(1)
  token: string;
}
