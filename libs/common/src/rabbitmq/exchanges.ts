/**
 * RabbitMQ Exchange Definitions
 * @see docs/Event_Catalog_RabbitMQ.md
 */

export interface ExchangeDefinition {
  name: string;
  type: 'topic' | 'direct' | 'fanout' | 'headers';
  options: {
    durable: boolean;
    autoDelete: boolean;
  };
}

export const EXCHANGES: Record<string, ExchangeDefinition> = {
  /**
   * Main exchange for business events
   * Routing: topic-based (<domain>.<entity>.<action>)
   */
  EVENTS: {
    name: 'cyna.events',
    type: 'topic',
    options: {
      durable: true,
      autoDelete: false,
    },
  },

  /**
   * Direct exchange for synchronous request/response
   * Used by API Gateway to communicate with microservices
   */
  DIRECT: {
    name: 'cyna.direct',
    type: 'direct',
    options: {
      durable: true,
      autoDelete: false,
    },
  },

  /**
   * Exchange for notification-related messages
   * Routing: direct (email, push, sms)
   */
  NOTIFICATIONS: {
    name: 'cyna.notifications',
    type: 'direct',
    options: {
      durable: true,
      autoDelete: false,
    },
  },

  /**
   * Fanout exchange for analytics events
   * All analytics events are broadcast to all consumers
   */
  ANALYTICS: {
    name: 'cyna.analytics',
    type: 'fanout',
    options: {
      durable: true,
      autoDelete: false,
    },
  },

  /**
   * Dead Letter Exchange for failed messages
   * Routing: topic-based (<service>.dlq)
   */
  DLX: {
    name: 'cyna.dlx',
    type: 'topic',
    options: {
      durable: true,
      autoDelete: false,
    },
  },
} as const;

export const EXCHANGE_NAMES = {
  EVENTS: EXCHANGES.EVENTS.name,
  DIRECT: EXCHANGES.DIRECT.name,
  NOTIFICATIONS: EXCHANGES.NOTIFICATIONS.name,
  ANALYTICS: EXCHANGES.ANALYTICS.name,
  DLX: EXCHANGES.DLX.name,
} as const;
