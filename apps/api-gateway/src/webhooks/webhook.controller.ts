import { Controller, Post, Req, Res, Inject, Logger, HttpCode } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Request, Response } from 'express';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { Public, SERVICE_NAMES, EVENT_PATTERNS } from '@cyna-api/common';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(
    @Inject(SERVICE_NAMES.PAYMENT) private readonly paymentClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY', '');
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
    });
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET', '');
  }

  @Public()
  @Post('stripe')
  @HttpCode(200)
  async handleStripeWebhook(@Req() req: Request, @Res() res: Response) {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      this.logger.warn('Webhook received without stripe-signature header');
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(req.body, signature, this.webhookSecret);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Webhook signature verification failed: ${message}`);
      return res.status(400).json({ error: `Webhook Error: ${message}` });
    }

    this.logger.log(`Webhook received: ${event.type} (${event.id})`);

    // Emit the event via RabbitMQ for the Payment Service to handle
    this.paymentClient.emit(EVENT_PATTERNS.PAYMENT.WEBHOOK_RECEIVED, {
      eventId: event.id,
      eventType: event.type,
      data: event.data.object,
      created: event.created,
    });

    return res.json({ received: true });
  }
}
