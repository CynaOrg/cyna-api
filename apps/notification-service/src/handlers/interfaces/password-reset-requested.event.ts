import { Language } from '@cyna-api/common';

export interface PasswordResetRequestedEvent {
  userId: string;
  email: string;
  firstName: string;
  resetToken: string;
  language: Language;
}
