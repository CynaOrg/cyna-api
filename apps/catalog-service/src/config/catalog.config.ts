import { registerAs } from '@nestjs/config';

export default registerAs('catalog', () => ({
  stock: {
    reservationExpiryMinutes: parseInt(process.env.STOCK_RESERVATION_EXPIRY_MINUTES || '15', 10),
    alertDefaultThreshold: parseInt(process.env.STOCK_ALERT_DEFAULT_THRESHOLD || '10', 10),
  },
  seed: {
    enabled: process.env.CATALOG_SEED_ENABLED === 'true',
  },
}));
