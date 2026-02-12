import { Module } from '@nestjs/common';
import { OrderGatewayController } from './order.controller';

@Module({
  controllers: [OrderGatewayController],
})
export class OrderModule {}
