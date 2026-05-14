import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { SERVICE_NAMES, EVENT_PATTERNS } from '@cyna-api/common';
import { WebhookController } from './webhook.controller';
import {
  createMockClientProxy,
  MockClientProxy,
} from '../../../../libs/common/test/mocks/rabbitmq.mock';

const STRIPE_SECRET = 'sk_test_dummy_key';
const WEBHOOK_SECRET = 'whsec_test_dummy';

// Capture spy refs at module scope so we can manipulate them per-test
let constructEventSpy: jest.Mock;

jest.mock('stripe', () => {
  // The constructor must return an instance with .webhooks.constructEvent
  const ctor = jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: (...args: unknown[]) => constructEventSpy(...args),
    },
  }));
  return { __esModule: true, default: ctor };
});

const buildRes = (): Response => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as unknown as Response['status'];
  res.json = jest.fn().mockReturnValue(res) as unknown as Response['json'];
  return res as Response;
};

describe('WebhookController', () => {
  let controller: WebhookController;
  let paymentClient: MockClientProxy;

  beforeEach(async () => {
    constructEventSpy = jest.fn();
    paymentClient = createMockClientProxy(null);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: SERVICE_NAMES.PAYMENT, useValue: paymentClient },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'STRIPE_SECRET_KEY') return STRIPE_SECRET;
              if (key === 'STRIPE_WEBHOOK_SECRET') return WEBHOOK_SECRET;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get(WebhookController);
  });

  it('should emit WEBHOOK_RECEIVED when Stripe signature is valid', async () => {
    const stripeEvent = {
      id: 'evt_test_1',
      type: 'payment_intent.succeeded',
      created: 1700000000,
      data: { object: { id: 'pi_123', amount: 5000 } },
    };
    constructEventSpy.mockReturnValue(stripeEvent);

    const req = {
      headers: { 'stripe-signature': 't=1,v1=valid_sig' },
      body: Buffer.from('{"type":"payment_intent.succeeded"}'),
    } as unknown as Request;
    const res = buildRes();

    await controller.handleStripeWebhook(req, res);

    expect(constructEventSpy).toHaveBeenCalledWith(req.body, 't=1,v1=valid_sig', WEBHOOK_SECRET);
    expect(paymentClient.emit).toHaveBeenCalledWith(
      EVENT_PATTERNS.PAYMENT.WEBHOOK_RECEIVED,
      expect.objectContaining({
        eventId: 'evt_test_1',
        eventType: 'payment_intent.succeeded',
        data: { id: 'pi_123', amount: 5000 },
        created: 1700000000,
      }),
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('should return 400 when stripe-signature header is missing', async () => {
    const req = {
      headers: {},
      body: Buffer.from('{}'),
    } as unknown as Request;
    const res = buildRes();

    await controller.handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing stripe-signature header' });
    expect(constructEventSpy).not.toHaveBeenCalled();
    expect(paymentClient.emit).not.toHaveBeenCalled();
  });

  it('should return 400 when constructEvent throws (invalid signature)', async () => {
    constructEventSpy.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    const req = {
      headers: { 'stripe-signature': 't=1,v1=tampered' },
      body: Buffer.from('{"evil":true}'),
    } as unknown as Request;
    const res = buildRes();

    await controller.handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.stringContaining('Webhook Error: No signatures found'),
    });
    expect(paymentClient.emit).not.toHaveBeenCalled();
  });

  it('should NOT bypass signature verification — even with empty body Stripe is consulted', async () => {
    // Critical security check: webhook is NEVER processed without going through constructEvent
    constructEventSpy.mockImplementation(() => {
      throw new Error('Webhook payload is empty');
    });
    const req = {
      headers: { 'stripe-signature': 't=1,v1=x' },
      body: undefined,
    } as unknown as Request;
    const res = buildRes();

    await controller.handleStripeWebhook(req, res);

    expect(constructEventSpy).toHaveBeenCalledWith(undefined, 't=1,v1=x', WEBHOOK_SECRET);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(paymentClient.emit).not.toHaveBeenCalled();
  });

  it('should pass the EXACT stripe-signature header value to constructEvent (no rewriting)', async () => {
    const exactSig = 't=1700000000,v1=abc123def456,v0=legacy';
    constructEventSpy.mockReturnValue({
      id: 'evt_2',
      type: 'invoice.paid',
      created: 1,
      data: { object: {} },
    });

    const req = {
      headers: { 'stripe-signature': exactSig },
      body: Buffer.from('{}'),
    } as unknown as Request;
    const res = buildRes();

    await controller.handleStripeWebhook(req, res);

    expect(constructEventSpy).toHaveBeenCalledWith(req.body, exactSig, WEBHOOK_SECRET);
  });
});
