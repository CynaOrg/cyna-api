import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, retry, throwError } from 'rxjs';
import {
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  UpdateProfileDto,
  UpdatePasswordDto,
  UpdateLanguageDto,
  DeleteAccountDto,
} from '@cyna-api/common';

@Injectable()
export class ProfileService {
  private readonly TIMEOUT = 10000; // 10 seconds

  constructor(
    @Inject(SERVICE_NAMES.USER)
    private readonly userClient: ClientProxy,
  ) {}

  async getProfile(userId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.GET_PROFILE, { userId }, { retry: true });
  }

  // No retry: mutation, must stay idempotent
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.UPDATE_PROFILE, {
      userId,
      ...dto,
    });
  }

  // No retry: mutation, must stay idempotent
  async updatePassword(userId: string, dto: UpdatePasswordDto) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.UPDATE_PASSWORD, {
      userId,
      ...dto,
    });
  }

  // No retry: mutation, must stay idempotent
  async updateLanguage(userId: string, dto: UpdateLanguageDto) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.UPDATE_LANGUAGE, {
      userId,
      ...dto,
    });
  }

  // No retry: mutation, must stay idempotent
  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.DELETE_ACCOUNT, {
      userId,
      ...dto,
    });
  }

  private async sendMessage<T>(
    pattern: { cmd: string },
    data: T,
    options: { retry?: boolean } = {},
  ) {
    const obs = this.userClient.send(pattern, data).pipe(timeout(this.TIMEOUT));
    const withRetry = options.retry ? obs.pipe(retry({ count: 2, delay: 1000 })) : obs;
    return firstValueFrom(
      withRetry.pipe(
        catchError((err) => {
          if (err && typeof err === 'object' && 'statusCode' in err) {
            const statusCode = err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = err.message || 'An error occurred';
            const code = err.code || 'UNKNOWN_ERROR';

            return throwError(
              () => new HttpException({ message, error: code, statusCode }, statusCode),
            );
          }

          if (err.name === 'TimeoutError') {
            return throwError(
              () =>
                new HttpException(
                  { message: 'Service unavailable', error: 'SERVICE_TIMEOUT' },
                  HttpStatus.SERVICE_UNAVAILABLE,
                ),
            );
          }

          return throwError(() => err);
        }),
      ),
    );
  }
}
