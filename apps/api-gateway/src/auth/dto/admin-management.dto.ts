import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { AdminRole } from '@cyna-api/common';

export class CreateAdminDto {
  @ApiProperty({ example: 'admin@cyna.io', description: 'Admin email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!', description: 'Admin password (min 8 characters)' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({
    enum: AdminRole,
    example: AdminRole.COMMERCIAL,
    description: 'Admin role',
  })
  @IsEnum(AdminRole)
  role: AdminRole;
}

export class UpdateAdminDto {
  @ApiPropertyOptional({ example: 'John', description: 'First name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Last name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    enum: AdminRole,
    example: AdminRole.COMMERCIAL,
    description: 'Admin role',
  })
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @ApiPropertyOptional({ example: true, description: 'Whether the admin account is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
