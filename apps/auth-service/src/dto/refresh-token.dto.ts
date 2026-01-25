import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  refreshToken: string;
}
