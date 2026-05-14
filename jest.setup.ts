// Globally available before each test file is loaded. Provides safe defaults
// for env vars required by the Joi validation in libs/common (JWT_SECRET min
// 32 chars). Local devs already get these from `.env`; this guarantees CI and
// IDE runs don't blow up at module-load time.
process.env.JWT_SECRET ??= 'unit-test-jwt-secret-minimum-thirty-two-characters!!';
process.env.STRIPE_SECRET_KEY ??= 'sk_test_unit_test_only';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_unit_test_only';
process.env.RABBITMQ_URL ??= 'amqp://guest:guest@localhost:5672';
process.env.NODE_ENV ??= 'test';

export {};
