import { UserResponseDto } from './user-response.dto';

export class AuthResponseDto {
  accessToken: string;
  expiresIn: number;
  user: UserResponseDto;
}
