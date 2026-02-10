import { Language } from '@cyna-api/common';

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
}
