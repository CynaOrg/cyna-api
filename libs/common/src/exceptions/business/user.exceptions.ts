import { NotFoundException, ConflictException, BadRequestException } from '../base.exception';
import { ERROR_CODES } from '../error-codes';

/**
 * User Exceptions
 */

export class UserNotFoundException extends NotFoundException {
  constructor() {
    super(ERROR_CODES.USER_NOT_FOUND, 'errors.user.notFound');
  }
}

export class UserEmailExistsException extends ConflictException {
  constructor() {
    super(ERROR_CODES.USER_EMAIL_EXISTS, 'errors.user.emailExists');
  }
}

export class UserInvalidPasswordException extends BadRequestException {
  constructor() {
    super(ERROR_CODES.USER_INVALID_PASSWORD, 'errors.user.invalidPassword');
  }
}

export class UserCannotDeleteWithSubscriptionsException extends BadRequestException {
  constructor() {
    super(
      ERROR_CODES.USER_CANNOT_DELETE_WITH_SUBSCRIPTIONS,
      'errors.user.cannotDeleteWithActiveSubscriptions',
    );
  }
}
