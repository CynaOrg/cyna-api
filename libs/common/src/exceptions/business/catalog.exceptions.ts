import { NotFoundException, BadRequestException, ConflictException } from '../base.exception';
import { ERROR_CODES } from '../error-codes';

/**
 * Catalog Exceptions
 */

export class ProductNotFoundException extends NotFoundException {
  constructor() {
    super(ERROR_CODES.PRODUCT_NOT_FOUND, 'errors.catalog.productNotFound');
  }
}

export class CategoryNotFoundException extends NotFoundException {
  constructor() {
    super(ERROR_CODES.CATEGORY_NOT_FOUND, 'errors.catalog.categoryNotFound');
  }
}

export class CategoryHasProductsException extends ConflictException {
  constructor() {
    super(ERROR_CODES.CATEGORY_HAS_PRODUCTS, 'errors.catalog.categoryHasProducts');
  }
}

export class InvalidProductTypeException extends BadRequestException {
  constructor() {
    super(ERROR_CODES.INVALID_PRODUCT_TYPE, 'errors.catalog.invalidProductType');
  }
}
