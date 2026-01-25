import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({ example: 'refresh-token', description: 'Refresh token to revoke (optional, revokes all if not provided)' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
