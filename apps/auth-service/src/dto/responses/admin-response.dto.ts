import { AdminRole } from '@cyna-api/common';

export class AdminResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;

  static fromEntity(admin: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: AdminRole;
    isActive: boolean;
    createdAt: Date;
    lastLoginAt?: Date | null;
  }): AdminResponseDto {
    const dto = new AdminResponseDto();
    dto.id = admin.id;
    dto.email = admin.email;
    dto.firstName = admin.firstName;
    dto.lastName = admin.lastName;
    dto.role = admin.role;
    dto.isActive = admin.isActive;
    dto.createdAt = admin.createdAt;
    dto.lastLoginAt = admin.lastLoginAt ?? null;
    return dto;
  }
}
