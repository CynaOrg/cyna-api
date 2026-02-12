import { IsOptional, IsBoolean, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateContactMessageDto {
  @IsOptional()
  @IsBoolean({ message: 'validation.isRead.invalid' })
  isRead?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'validation.isProcessed.invalid' })
  isProcessed?: boolean;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  notes?: string;
}
