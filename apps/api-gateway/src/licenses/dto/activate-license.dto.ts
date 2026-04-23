import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ActivateLicenseDto {
  @ApiProperty({ description: 'One-shot activation token delivered by email' })
  @IsString()
  @Length(20, 128)
  token: string;
}
