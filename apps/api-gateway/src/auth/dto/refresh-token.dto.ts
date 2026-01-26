import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    example: 'refresh-token',
    description: 'Refresh token (optional - can also be provided via HTTP-only cookie)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  refreshToken?: string;
}
