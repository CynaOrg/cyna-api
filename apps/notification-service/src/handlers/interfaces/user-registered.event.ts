import { Language } from '@cyna-api/common';

export interface UserRegisteredEvent {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  verificationToken: string;
  language: Language;
}
