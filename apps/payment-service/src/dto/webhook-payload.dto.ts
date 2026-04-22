import { IsNumber, IsObject, IsString } from 'class-validator';

export class WebhookPayloadDto {
  @IsString()
  eventId: string;

  @IsString()
  eventType: string;

  @IsObject()
  data: Record<string, unknown>;

  @IsNumber()
  created: number;
}
