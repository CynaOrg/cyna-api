import { Module } from '@nestjs/common';
import { UserAdminController } from './user-admin.controller';

@Module({
  controllers: [UserAdminController],
})
export class UserModule {}
