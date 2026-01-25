export interface Admin2FACodeRequestedEvent {
  adminId: string;
  email: string;
  firstName: string;
  code: string;
  expiresInMinutes: number;
  language: 'fr' | 'en';
}
