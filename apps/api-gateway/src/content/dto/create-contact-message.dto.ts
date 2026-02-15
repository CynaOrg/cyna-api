import { IsString, IsEmail, IsNotEmpty, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateContactMessageDto {
  @ApiProperty({ description: 'Sender name' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiProperty({ description: 'Sender email' })
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({ description: 'Message subject' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  @Transform(({ value }) => value?.trim())
  subject: string;

  @ApiProperty({ description: 'Message body' })
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  @Transform(({ value }) => value?.trim())
  message: string;
}
