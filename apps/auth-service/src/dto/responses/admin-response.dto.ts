import { AdminRole } from '@cyna-api/common';

export class AdminResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AdminRole;

  static fromEntity(admin: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: AdminRole;
  }): AdminResponseDto {
    const dto = new AdminResponseDto();
    dto.id = admin.id;
    dto.email = admin.email;
    dto.firstName = admin.firstName;
    dto.lastName = admin.lastName;
    dto.role = admin.role;
    return dto;
  }
}
