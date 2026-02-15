import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAccountDto {
  @ApiProperty({
    description: 'Current password for confirmation',
    example: 'MySecurePassword123!',
  })
  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  password: string;
}