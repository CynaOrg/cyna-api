import { registerAs } from '@nestjs/config';

export default registerAs('catalog', () => ({
  // Service configuration
  serviceName: 'catalog-service',
  servicePort: parseInt(process.env.CATALOG_SERVICE_PORT || '3002', 10),

  // Database
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'cyna',
    password: process.env.DATABASE_PASSWORD || 'cyna_dev',
    name: process.env.DATABASE_NAME || 'cyna_db',
  },

  // RabbitMQ
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    queue: 'catalog.queue',
    eventsQueue: 'catalog.events',
  },

  // Stock settings
  stock: {
    reservationDurationMinutes: parseInt(
      process.env.STOCK_RESERVATION_DURATION_MINUTES || '15',
      10,
    ),
    lowStockThreshold: parseInt(process.env.LOW_STOCK_THRESHOLD || '10', 10),
  },

  // Image upload settings (will be used with Cloudflare R2)
  images: {
    maxFileSize: parseInt(process.env.IMAGE_MAX_FILE_SIZE || '5242880', 10), // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxImagesPerProduct: parseInt(process.env.MAX_IMAGES_PER_PRODUCT || '10', 10),
  },
}));
