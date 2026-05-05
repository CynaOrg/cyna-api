import {
  Controller,
  Get,
  Patch,
  Param,
  ParseUUIDPipe,
  Query,
  Body,
  Inject,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, throwError, TimeoutError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiPropertyOptional,
  ApiProperty,
} from '@nestjs/swagger';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { SuperAdminGuard } from '../auth/guards';
import { IsOptional, IsBoolean, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

class AdminUserQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}

class UpdateUserStatusDto {
  @ApiProperty({ description: 'Whether the user account is active' })
  @IsBoolean()
  isActive: boolean;
}

@ApiTags('Admin - Users')
@Controller('admin/users')
@UseGuards(SuperAdminGuard)
@ApiBearerAuth('JWT-auth')
export class UserAdminController {
  constructor(
    @Inject(SERVICE_NAMES.USER) private readonly userClient: ClientProxy,
    @Inject(SERVICE_NAMES.ORDER) private readonly orderClient: ClientProxy,
  ) {}

  private async sendMessage<T>(pattern: { cmd: string }, data: T) {
    return firstValueFrom(
      this.userClient.send(pattern, data).pipe(
        timeout(10000),
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
                  { message: err.message, error: err.code },
                  err.statusCode as number,
                ),
            );
          }
          return throwError(() => err);
        }),
      ),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all users (super_admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated list of users' })
  async findAll(@Query() query: AdminUserQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.ADMIN_LIST, query);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get user detail (super_admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.ADMIN_GET, { userId });
  }

  @Patch(':userId/status')
  @ApiOperation({ summary: 'Update user active status (super_admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User status updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateStatus(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.sendMessage(MESSAGE_PATTERNS.USER.ADMIN_UPDATE_STATUS, {
      userId,
      isActive: dto.isActive,
    });
  }

  @Get(':userId/orders')
  @ApiOperation({ summary: 'List orders of a given user (super_admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Paginated list of orders' })
  async getUserOrders(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: AdminUserQueryDto,
  ): Promise<unknown> {
    return firstValueFrom(
      this.orderClient
        .send(MESSAGE_PATTERNS.ORDER.ADMIN_GET_ORDERS, {
          userId,
          page: query.page,
          limit: query.limit,
        })
        .pipe(
          timeout(10000),
          catchError((err) => {
            if (err instanceof TimeoutError) {
              return throwError(
                () => new HttpException('Order service timeout', HttpStatus.SERVICE_UNAVAILABLE),
              );
            }
            return throwError(() => err);
          }),
        ),
    );
  }
}
