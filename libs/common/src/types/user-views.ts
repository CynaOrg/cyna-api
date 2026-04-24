import { Language } from '../enums/language.enum';

/**
 * Public profile view of a user returned by USER_SERVICE for profile-oriented
 * operations. Does NOT contain the password hash.
 */
export interface UserProfileView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  vatNumber?: string;
  isActive: boolean;
  isVerified: boolean;
  preferredLanguage: Language;
  stripeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Credentials view of a user returned by USER_SERVICE for authentication
 * operations. Includes the password hash so AUTH_SERVICE can verify it.
 */
export interface UserCredentialsView {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isVerified: boolean;
  preferredLanguage: Language;
}
