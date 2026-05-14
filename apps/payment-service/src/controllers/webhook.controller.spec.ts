import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { WebhookEventController } from './webhook.controller';
import { WebhookService } from '../services/webhook.service';
import { WebhookPayloadDto } from '../dto/webhook-payload.dto';

describe('WebhookEventController', () => {
  let controller: WebhookEventController;
  let webhookService: { handleWebhookEvent: jest.Mock };

  const samplePayload: WebhookPayloadDto = {
    eventId: 'evt_test_123',
    eventType: 'payment_intent.succeeded',
    data: { object: { id: 'pi_1' } },
    created: 1700000000,
  };

  beforeEach(async () => {
    webhookService = { handleWebhookEvent: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookEventController],
      providers: [{ provide: WebhookService, useValue: webhookService }],
    }).compile();

    controller = module.get<WebhookEventController>(WebhookEventController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('delegates the payload to WebhookService.handleWebhookEvent', async () => {
    await controller.handleWebhook(samplePayload);
    expect(webhookService.handleWebhookEvent).toHaveBeenCalledWith(samplePayload);
  });

  // Regression: the EventPattern handler must NEVER throw — RabbitMQ would
  // requeue the message infinitely. The controller swallows the error and logs.
  it('does not throw when the service rejects (RabbitMQ-safe)', async () => {
    webhookService.handleWebhookEvent.mockRejectedValueOnce(new Error('DB down'));
    await expect(controller.handleWebhook(samplePayload)).resolves.not.toThrow();
  });

  it('logs the failure with eventId when service rejects', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    webhookService.handleWebhookEvent.mockRejectedValueOnce(new Error('boom'));

    await controller.handleWebhook(samplePayload);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('evt_test_123'), expect.anything());
    logSpy.mockRestore();
  });

  it('logs even when service throws a non-Error', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    webhookService.handleWebhookEvent.mockRejectedValueOnce('opaque string failure');

    await controller.handleWebhook(samplePayload);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown'), undefined);
    logSpy.mockRestore();
  });
});
