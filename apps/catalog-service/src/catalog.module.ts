import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CynaConfigModule, LoggerModule } from '@cyna-api/common';
import {
  Category,
  Product,
  ProductImage,
  ProductCharacteristic,
  StockReservation,
} from './entities';
import { CategoryService, ProductService, StockService } from './services';

@Module({
  imports: [
    CynaConfigModule,
    LoggerModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USER || 'cyna',
      password: process.env.DATABASE_PASSWORD || 'cyna_dev',
      database: process.env.DATABASE_NAME || 'cyna_db',
      entities: [Category, Product, ProductImage, ProductCharacteristic, StockReservation],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    }),
    TypeOrmModule.forFeature([
      Category,
      Product,
      ProductImage,
      ProductCharacteristic,
      StockReservation,
    ]),
  ],
  controllers: [],
  providers: [CategoryService, ProductService, StockService],
})
export class CatalogModule {}
