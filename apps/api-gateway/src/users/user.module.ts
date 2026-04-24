import { Module } from '@nestjs/common';
import { UserAdminController } from './user-admin.controller';
import { UserAddressController } from './user-address.controller';

@Module({
  controllers: [UserAdminController, UserAddressController],
})
export class UserModule {}
