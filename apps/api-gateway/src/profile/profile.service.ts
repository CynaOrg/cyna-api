import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
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
    @Inject(SERVICE_NAMES.AUTH)
    private readonly authClient: ClientProxy,
  ) {}

  async getProfile(userId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.GET_PROFILE, { userId });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.UPDATE_PROFILE, {
      userId,
      ...dto,
    });
  }

  async updatePassword(userId: string, dto: UpdatePasswordDto) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.UPDATE_PASSWORD, {
      userId,
      ...dto,
    });
  }

  async updateLanguage(userId: string, dto: UpdateLanguageDto) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.UPDATE_LANGUAGE, {
      userId,
      ...dto,
    });
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.DELETE_ACCOUNT, {
      userId,
      ...dto,
    });
  }

  private async sendMessage<T>(pattern: { cmd: string }, data: T) {
    return firstValueFrom(
      this.authClient.send(pattern, data).pipe(
        timeout(this.TIMEOUT),
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
