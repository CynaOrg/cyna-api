import { IsBoolean } from 'class-validator';

export class AdminUpdateStatusDto {
  @IsBoolean()
  isActive: boolean;
}
