import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateHeroTextDto {
  @ApiProperty({ description: 'Hero title in French' })
  @IsString()
  titleFr: string;

  @ApiPropertyOptional({ description: 'Hero title in English' })
  @IsOptional()
  @IsString()
  titleEn?: string;

  @ApiProperty({ description: 'Hero subtitle in French' })
  @IsString()
  subtitleFr: string;

  @ApiPropertyOptional({ description: 'Hero subtitle in English' })
  @IsOptional()
  @IsString()
  subtitleEn?: string;
}
