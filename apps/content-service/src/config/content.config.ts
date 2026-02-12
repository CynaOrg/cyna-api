import { registerAs } from '@nestjs/config';

export default registerAs('content', () => ({
  seed: {
    enabled: process.env.CONTENT_SEED_ENABLED === 'true',
  },
}));
