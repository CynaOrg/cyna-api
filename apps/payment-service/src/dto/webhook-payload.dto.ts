export class WebhookPayloadDto {
  eventId: string;
  eventType: string;
  data: Record<string, unknown>;
  created: number;
}
