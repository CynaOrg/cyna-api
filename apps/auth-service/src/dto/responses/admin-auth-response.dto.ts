import { AdminResponseDto } from './admin-response.dto';

export class AdminAuthResponseDto {
  accessToken: string;
  expiresIn: number;
  admin: AdminResponseDto;
}
