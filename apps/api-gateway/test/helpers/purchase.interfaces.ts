/**
 * Shared response interfaces used across purchase-related E2E tests.
 * Centralizes types that were previously duplicated in multiple test files.
 */

export interface CartResponse {
  data: {
    id: string;
    userId: string | null;
    sessionId: string | null;
    items: Array<{
      id: string;
      productId: string;
      quantity: number;
      billingPeriod: string;
      product: Record<string, unknown> | null;
    }>;
    itemCount: number;
  };
}

export interface CheckoutResponse {
  data: {
    clientSecret: string;
    paymentIntentId: string;
    orderId: string;
    orderNumber: string;
    amount: number;
    currency: string;
  };
}

export interface OrdersListResponse {
  data: Array<{
    id: string;
    orderNumber: string;
    status: string;
    total: number | string;
    items: Array<{
      productId: string;
      quantity: number;
    }>;
  }>;
}

export interface OrderDetailResponse {
  data: {
    id: string;
    orderNumber: string;
    status: string;
    total: number | string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number | string;
      totalPrice: number | string;
    }>;
  };
}

export interface SubscriptionCreateResponse {
  data: {
    clientSecret: string;
    subscriptionId: string;
  };
}

export interface SubscriptionsListResponse {
  data: Array<{
    id: string;
    userId: string;
    productId: string;
    status: string;
    billingPeriod: string;
    price: number | string;
  }>;
}

export interface SubscriptionCancelResponse {
  data: {
    id: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    cancelledAt: string | null;
  };
}
