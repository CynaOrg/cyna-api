export interface PasswordResetRequestedEvent {
  userId: string;
  email: string;
  firstName: string;
  resetToken: string;
  language: 'fr' | 'en';
}
