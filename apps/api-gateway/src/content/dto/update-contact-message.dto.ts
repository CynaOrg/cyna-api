import { IsOptional, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateContactMessageDto {
  @ApiPropertyOptional({
    description: 'Message status',
    enum: ['new', 'read', 'replied', 'archived'],
  })
  @IsOptional()
  @IsEnum(['new', 'read', 'replied', 'archived'])
  status?: string;

  @ApiPropertyOptional({ description: 'Admin notes' })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}
