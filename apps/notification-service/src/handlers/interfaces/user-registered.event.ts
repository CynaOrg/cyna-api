export interface UserRegisteredEvent {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  verificationToken: string;
  language: 'fr' | 'en';
}
