import { Language, UserCredentialsView, UserProfileView } from '@cyna-api/common';

export class UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  vatNumber?: string;
  preferredLanguage: Language;
  isVerified: boolean;
  createdAt: Date;

  static fromEntity(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    companyName?: string;
    vatNumber?: string;
    preferredLanguage: Language;
    isVerified: boolean;
    createdAt: Date;
  }): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.companyName = user.companyName;
    dto.vatNumber = user.vatNumber;
    dto.preferredLanguage = user.preferredLanguage;
    dto.isVerified = user.isVerified;
    dto.createdAt = user.createdAt;
    return dto;
  }

  static fromProfileView(view: UserProfileView): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = view.id;
    dto.email = view.email;
    dto.firstName = view.firstName;
    dto.lastName = view.lastName;
    dto.companyName = view.companyName;
    dto.vatNumber = view.vatNumber;
    dto.preferredLanguage = view.preferredLanguage;
    dto.isVerified = view.isVerified;
    dto.createdAt = view.createdAt;
    return dto;
  }

  static fromCredentialsView(view: UserCredentialsView): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = view.id;
    dto.email = view.email;
    dto.firstName = view.firstName;
    dto.lastName = view.lastName;
    dto.companyName = undefined;
    dto.vatNumber = undefined;
    dto.preferredLanguage = view.preferredLanguage;
    dto.isVerified = view.isVerified;
    // createdAt is not part of the credentials view; set to epoch so the DTO
    // remains shape-compatible. Callers that need createdAt should use the
    // profile view instead.
    dto.createdAt = new Date(0);
    return dto;
  }
}
