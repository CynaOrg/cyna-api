import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
import { CreateUserAddressDto, UpdateUserAddressDto } from '../dto';
import { UserAddressService } from '../services/user-address.service';

@Controller()
export class UserAddressController {
  constructor(private readonly svc: UserAddressService) {}

  @MessagePattern(MESSAGE_PATTERNS.USER.GET_ADDRESSES)
  list(@Payload() data: { userId: string }) {
    return this.svc.list(data.userId);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.CREATE_ADDRESS)
  create(@Payload() data: { userId: string } & CreateUserAddressDto) {
    const { userId, ...dto } = data;
    return this.svc.create(userId, dto);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_ADDRESS)
  update(@Payload() data: { userId: string; id: string } & UpdateUserAddressDto) {
    const { userId, id, ...dto } = data;
    return this.svc.update(userId, id, dto);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.DELETE_ADDRESS)
  async delete(@Payload() data: { userId: string; id: string }) {
    await this.svc.delete(data.userId, data.id);
    return { success: true };
  }
}
