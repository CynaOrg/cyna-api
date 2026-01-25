import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class Verify2FADto {
  @ApiProperty({ example: 'temp-token', description: 'Temporary token from login step 1' })
  @IsString()
  tempToken: string;

  @ApiProperty({ example: '123456', description: '6-digit verification code' })
  @IsString()
  @Length(6, 6, { message: 'Code must be exactly 6 digits' })
  code: string;
}
