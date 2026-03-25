// Set test environment variables before tests run
process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5433';
process.env.DATABASE_USER = process.env.DATABASE_USER || 'cyna';
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'cyna_dev';
process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'cyna_db';
process.env.DATABASE_SYNC = process.env.DATABASE_SYNC || 'true';
process.env.RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret-key-minimum-32-chars';
process.env.STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY || 'sk_test_fake_key_for_e2e_tests_only';
process.env.STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET || 'whsec_fake_secret_for_e2e_tests_only';
process.env.NODE_ENV = 'test';

export {};
