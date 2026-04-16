import { Language } from '../enums/language.enum';

export interface UserVerifiedEvent {
  userId: string;
  email: string;
  language: Language;
}

export interface PasswordChangedEvent {
  userId: string;
  email: string;
  language: Language;
  timestamp: Date;
}

export interface PasswordResetCompletedEvent {
  userId: string;
  email: string;
  language: Language;
  timestamp: Date;
}
