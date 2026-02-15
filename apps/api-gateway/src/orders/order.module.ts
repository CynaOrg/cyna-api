import { Module } from '@nestjs/common';
import { OrderGatewayController } from './order.controller';
import { OrderAdminController } from './order-admin.controller';

@Module({
  controllers: [OrderGatewayController, OrderAdminController],
})
export class OrderModule {}
