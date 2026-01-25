import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class Resend2FADto {
  @ApiProperty({ example: 'temp-token', description: 'Temporary token from login step 1' })
  @IsString()
  tempToken: string;
}
