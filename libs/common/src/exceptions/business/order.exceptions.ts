import { NotFoundException, BadRequestException, ConflictException } from '../base.exception';
import { ERROR_CODES } from '../error-codes';

/**
 * Order Exceptions
 */

export class CartEmptyException extends BadRequestException {
  constructor() {
    super(ERROR_CODES.CART_EMPTY, 'errors.order.cartEmpty');
  }
}

export class CartItemNotFoundException extends NotFoundException {
  constructor() {
    super(ERROR_CODES.CART_ITEM_NOT_FOUND, 'errors.order.cartItemNotFound');
  }
}

export class SaasNotInCartException extends BadRequestException {
  constructor() {
    super(ERROR_CODES.SAAS_NOT_IN_CART, 'errors.order.saasNotInCart');
  }
}

export class ProductUnavailableException extends BadRequestException {
  constructor() {
    super(ERROR_CODES.PRODUCT_UNAVAILABLE, 'errors.order.productUnavailable');
  }
}

export class InsufficientStockException extends BadRequestException {
  constructor(productName: string, available: number) {
    super(ERROR_CODES.INSUFFICIENT_STOCK, 'errors.order.insufficientStock', [
      { productName, available },
    ]);
  }
}

export class CheckoutExpiredException extends BadRequestException {
  constructor() {
    super(ERROR_CODES.CHECKOUT_EXPIRED, 'errors.order.checkoutExpired');
  }
}

export class OrderNotFoundException extends NotFoundException {
  constructor() {
    super(ERROR_CODES.ORDER_NOT_FOUND, 'errors.order.orderNotFound');
  }
}

export class InvalidOrderStatusException extends BadRequestException {
  constructor() {
    super(ERROR_CODES.INVALID_ORDER_STATUS, 'errors.order.invalidOrderStatus');
  }
}

export class CannotCancelPaidOrderException extends ConflictException {
  constructor() {
    super(ERROR_CODES.CANNOT_CANCEL_PAID_ORDER, 'errors.order.cannotCancelPaidOrder');
  }
}
