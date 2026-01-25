export class Admin2FAResponseDto {
  requires2FA: boolean;
  tempToken: string;
  message: string;
}
