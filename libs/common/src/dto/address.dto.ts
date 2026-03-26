import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';

export class AddressDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsNotEmpty()
  street: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @IsString()
  @Length(2, 2)
  country: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  recipientName?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
