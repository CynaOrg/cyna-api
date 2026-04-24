import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { firstValueFrom, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import {
  CreateUserAddressDto,
  MESSAGE_PATTERNS,
  SERVICE_NAMES,
  UpdateUserAddressDto,
} from '@cyna-api/common';
import { CurrentUser } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards';

@ApiTags('User Addresses')
@ApiBearerAuth('JWT-auth')
@Controller('users/me/addresses')
@UseGuards(JwtAuthGuard)
export class UserAddressController {
  constructor(@Inject(SERVICE_NAMES.USER) private readonly userClient: ClientProxy) {}

  private sendMessage<T>(pattern: { cmd: string }, data: unknown): Promise<T> {
    return firstValueFrom(
      this.userClient.send<T>(pattern, data).pipe(
        timeout(5000),
        catchError((err) => {
          if (err instanceof TimeoutError) {
            return throwError(
              () => new HttpException('User service timeout', HttpStatus.SERVICE_UNAVAILABLE),
            );
          }
          if (err && typeof err === 'object' && 'statusCode' in err) {
            return throwError(
              () =>
                new HttpException(
                  { message: (err as any).message, error: (err as any).code },
                  (err as any).statusCode as number,
                ),
            );
          }
          return throwError(() => err);
        }),
      ),
    );
  }

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'List the current user addresses' })
  @ApiResponse({ status: 200, description: 'List of addresses' })
  list(@CurrentUser('id') userId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.GET_ADDRESSES, { userId });
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a new address' })
  @ApiResponse({ status: 201, description: 'Address created' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateUserAddressDto) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.CREATE_ADDRESS, {
      userId,
      ...dto,
    });
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Update an address' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserAddressDto,
  ) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.UPDATE_ADDRESS, {
      userId,
      id,
      ...dto,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Delete an address' })
  delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.DELETE_ADDRESS, {
      userId,
      id,
    });
  }
}
