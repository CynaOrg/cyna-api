import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionAdminController } from './subscription-admin.controller';

@Module({
  controllers: [SubscriptionController, SubscriptionAdminController],
})
export class SubscriptionModule {}
