import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CynaLoggerService } from './logger.service';

/**
 * Logger Module
 * Provides the CynaLoggerService globally
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [CynaLoggerService],
  exports: [CynaLoggerService],
})
export class LoggerModule {}
