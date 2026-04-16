import { Language } from '@cyna-api/common';

export interface Admin2FACodeRequestedEvent {
  adminId: string;
  email: string;
  firstName: string;
  code: string;
  expiresInMinutes: number;
  language: Language;
}
