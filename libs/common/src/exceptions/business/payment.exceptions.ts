import { NotFoundException, BadRequestException, ConflictException } from '../base.exception';
import { ERROR_CODES } from '../error-codes';

/**
 * Payment Exceptions
 */

export class PaymentFailedException extends BadRequestException {
  constructor() {
    super(ERROR_CODES.PAYMENT_FAILED, 'errors.payment.failed');
  }
}

export class SubscriptionNotFoundException extends NotFoundException {
  constructor() {
    super(ERROR_CODES.SUBSCRIPTION_NOT_FOUND, 'errors.payment.subscriptionNotFound');
  }
}

export class SubscriptionAlreadyCancelledException extends ConflictException {
  constructor() {
    super(ERROR_CODES.SUBSCRIPTION_ALREADY_CANCELLED, 'errors.payment.subscriptionAlreadyCancelled');
  }
}

export class InvalidBillingPeriodException extends BadRequestException {
  constructor() {
    super(ERROR_CODES.INVALID_BILLING_PERIOD, 'errors.payment.invalidBillingPeriod');
  }
}

export class PaymentMethodNotFoundException extends NotFoundException {
  constructor() {
    super(ERROR_CODES.PAYMENT_METHOD_NOT_FOUND, 'errors.payment.paymentMethodNotFound');
  }
}

export class CannotDeleteDefaultPaymentMethodException extends ConflictException {
  constructor() {
    super(
      ERROR_CODES.CANNOT_DELETE_DEFAULT_PAYMENT_METHOD,
      'errors.payment.cannotDeleteDefaultPaymentMethod',
    );
  }
}
