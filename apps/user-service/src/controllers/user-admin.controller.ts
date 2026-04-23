import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
import { UserAdminService, AdminListQuery } from '../services/user-admin.service';
import { AdminUpdateStatusDto } from '../dto/admin-update-status.dto';

@Controller()
export class UserAdminController {
  constructor(private readonly userAdminService: UserAdminService) {}

  @MessagePattern(MESSAGE_PATTERNS.USER.ADMIN_LIST)
  async adminList(@Payload() query: AdminListQuery) {
    return this.userAdminService.adminList(query);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.ADMIN_GET)
  async adminGet(@Payload() data: { userId: string }) {
    return this.userAdminService.adminGet(data.userId);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.ADMIN_UPDATE_STATUS)
  async adminUpdateStatus(@Payload() data: { userId: string } & AdminUpdateStatusDto) {
    const { userId, ...dto } = data;
    return this.userAdminService.adminUpdateStatus(userId, dto);
  }
}
