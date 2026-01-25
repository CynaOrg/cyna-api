/**
 * Base Event Interface
 * All events published to RabbitMQ must conform to this structure
 * @see docs/Event_Catalog_RabbitMQ.md
 */

export interface BaseEvent<T = unknown> {
  /**
   * Unique identifier for this event instance
   * Format: evt_<uuid>
   */
  eventId: string;

  /**
   * Type of event (routing key)
   * Format: <domain>.<entity>.<action>
   * Example: "order.order.created"
   */
  eventType: string;

  /**
   * ISO 8601 timestamp when the event was created
   */
  timestamp: string;

  /**
   * Schema version for backwards compatibility
   * Example: "1.0"
   */
  version: string;

  /**
   * Service that emitted this event
   * Example: "order-service"
   */
  source: string;

  /**
   * Correlation ID for tracing across services
   * Propagated from the original HTTP request
   */
  correlationId?: string;

  /**
   * Event payload data
   */
  data: T;
}

/**
 * Dead Letter Message structure
 * Messages that fail processing are wrapped in this structure
 */
export interface DeadLetterMessage<T = unknown> {
  originalEvent: BaseEvent<T>;
  error: {
    message: string;
    stack?: string;
  };
  retryCount: number;
  failedAt: string;
  originalQueue: string;
  originalRoutingKey: string;
}

/**
 * Factory function to create a new event
 */
export function createEvent<T>(
  eventType: string,
  source: string,
  data: T,
  correlationId?: string,
): BaseEvent<T> {
  return {
    eventId: `evt_${crypto.randomUUID()}`,
    eventType,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source,
    correlationId,
    data,
  };
}
