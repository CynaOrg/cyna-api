/**
 * RabbitMQ Queue Definitions
 * @see docs/Event_Catalog_RabbitMQ.md
 */

export interface QueueDefinition {
  name: string;
  options: {
    durable: boolean;
    deadLetterExchange?: string;
    deadLetterRoutingKey?: string;
    messageTtl?: number;
  };
}

export const QUEUES: Record<string, QueueDefinition> = {
  // Service Queues (for Request/Response patterns)
  AUTH: {
    name: 'auth.queue',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'auth.dlq',
    },
  },

  CATALOG: {
    name: 'catalog.queue',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'catalog.dlq',
    },
  },

  ORDER: {
    name: 'order.queue',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'order.dlq',
    },
  },

  PAYMENT: {
    name: 'payment.queue',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'payment.dlq',
    },
  },

  USER: {
    name: 'user.queue',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'user.dlq',
    },
  },

  CONTENT: {
    name: 'content.queue',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'content.dlq',
    },
  },

  // Event Queues (for Event patterns)
  AUTH_EVENTS: {
    name: 'auth.events',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'auth.dlq',
    },
  },

  CATALOG_EVENTS: {
    name: 'catalog.events',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'catalog.dlq',
    },
  },

  ORDER_EVENTS: {
    name: 'order.events',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'order.dlq',
    },
  },

  PAYMENT_EVENTS: {
    name: 'payment.events',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'payment.dlq',
    },
  },

  USER_EVENTS: {
    name: 'user.events',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'user.dlq',
    },
  },

  NOTIFICATION_EMAILS: {
    name: 'notification.emails',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'notification.dlq',
      messageTtl: 86400000, // 24 hours
    },
  },

  ANALYTICS_EVENTS: {
    name: 'analytics.events',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'analytics.dlq',
    },
  },

  // Dead Letter Queues
  DLQ_AUTH: {
    name: 'auth.dlq',
    options: { durable: true },
  },

  DLQ_CATALOG: {
    name: 'catalog.dlq',
    options: { durable: true },
  },

  DLQ_ORDER: {
    name: 'order.dlq',
    options: { durable: true },
  },

  DLQ_PAYMENT: {
    name: 'payment.dlq',
    options: { durable: true },
  },

  DLQ_USER: {
    name: 'user.dlq',
    options: { durable: true },
  },

  DLQ_NOTIFICATION: {
    name: 'notification.dlq',
    options: { durable: true },
  },

  DLQ_ANALYTICS: {
    name: 'analytics.dlq',
    options: { durable: true },
  },
} as const;

export const QUEUE_NAMES = {
  AUTH: QUEUES.AUTH.name,
  CATALOG: QUEUES.CATALOG.name,
  ORDER: QUEUES.ORDER.name,
  PAYMENT: QUEUES.PAYMENT.name,
  USER: QUEUES.USER.name,
  CONTENT: QUEUES.CONTENT.name,
} as const;
