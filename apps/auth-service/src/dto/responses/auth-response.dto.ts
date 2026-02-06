import { UserResponseDto } from './user-response.dto';

export class AuthResponseDto {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: UserResponseDto;
}
