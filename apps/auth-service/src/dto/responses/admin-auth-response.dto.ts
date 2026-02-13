import { AdminResponseDto } from './admin-response.dto';

export class AdminAuthResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  admin: AdminResponseDto;
}
