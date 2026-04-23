import { Language } from '../enums/language.enum';

export interface PaymentConfirmedEvent {
  orderId: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  language: Language;
  total: number;
  currency: string;
  itemsSummary: string;
}

export interface PaymentFailedEvent {
  orderId: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  language: Language;
  error: string;
}

export interface SubscriptionCreatedEvent {
  subscriptionId: string;
  userId: string;
  email: string;
  language: Language;
  productName: string;
  billingPeriod: string;
  price: number;
  currency: string;
}

export interface SubscriptionRenewedEvent {
  subscriptionId: string;
  userId: string;
  email: string;
  language: Language;
  productName: string;
  newPeriodEnd: string;
}

export interface SubscriptionPastDueEvent {
  subscriptionId: string;
  userId: string;
  email: string;
  language: Language;
  productName: string;
}

export interface SubscriptionCancelledEvent {
  subscriptionId: string;
  userId: string;
  email: string;
  language: Language;
  productName: string;
}

export interface RefundedEvent {
  orderId: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  language: Language;
  refundAmount: number;
  currency: string;
}

export interface IssuedLicense {
  licenseId: string;
  licenseKey: string;
  productSnapshot: {
    nameFr: string;
    nameEn: string;
    slug: string;
  };
  activationToken: string;
  activationExpiresAt: string;
}

export interface LicensesIssuedEvent {
  orderId: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  language: Language;
  licenses: IssuedLicense[];
}
