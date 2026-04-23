import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';

export class AddressDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code', example: 'FR' })
  @IsString()
  @Length(2, 2)
  country: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  recipientName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;
}
