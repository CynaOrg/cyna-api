import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseUUIDPipe,
  Body,
  Inject,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ClientProxy } from '@nestjs/microservices';
import {
  Observable,
  firstValueFrom,
  timeout,
  retry,
  catchError,
  throwError,
  TimeoutError,
} from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { SuperAdminGuard } from './guards';
import { CurrentUser } from './decorators';
import { CreateAdminDto, UpdateAdminDto } from './dto';

/**
 * Convert an RPC error to an HttpException so the
 * GlobalExceptionFilter can return the proper status code and message.
 */
function rpcToHttpError(err: unknown): Observable<never> {
  if (err instanceof TimeoutError) {
    return throwError(() => new HttpException('Auth service timeout', 503));
  }
  const errObj = err as Record<string, unknown> | undefined;
  const payload =
    typeof errObj?.message === 'object' ? (errObj.message as Record<string, unknown>) : errObj;
  const statusCode = typeof payload?.statusCode === 'number' ? payload.statusCode : 500;
  const message =
    (typeof payload?.message === 'string' ? payload.message : (errObj?.message as string)) ||
    'Internal server error';
  return throwError(() => new HttpException(message, statusCode));
}

@ApiTags('Admin - Admin Management')
@Controller('admin/admins')
@UseGuards(SuperAdminGuard)
@ApiBearerAuth('JWT-auth')
export class AdminManagementController {
  constructor(@Inject(SERVICE_NAMES.AUTH) private readonly authClient: ClientProxy) {}

  @Get()
  @ApiOperation({ summary: 'List all admin accounts (super admin only)' })
  @ApiResponse({ status: 200, description: 'List of admin accounts' })
  @ApiResponse({ status: 403, description: 'Super admin access required' })
  async getAdmins() {
    return firstValueFrom(
      this.authClient.send(MESSAGE_PATTERNS.AUTH.ADMIN_GET_ADMINS, {}).pipe(
        timeout(5000),
        retry(2),
        catchError((err) => rpcToHttpError(err)),
      ),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a new admin account (super admin only)' })
  @ApiResponse({ status: 201, description: 'Admin account created' })
  @ApiResponse({ status: 403, description: 'Super admin access required' })
  @ApiResponse({ status: 409, description: 'Email already taken' })
  async createAdmin(@Body() dto: CreateAdminDto) {
    return firstValueFrom(
      this.authClient.send(MESSAGE_PATTERNS.AUTH.ADMIN_CREATE_ADMIN, { ...dto }).pipe(
        timeout(5000),
        retry(1),
        catchError((err) => rpcToHttpError(err)),
      ),
    );
  }

  @Get(':adminId')
  @ApiOperation({ summary: 'Get admin account details (super admin only)' })
  @ApiParam({ name: 'adminId', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: 'Admin account details' })
  @ApiResponse({ status: 403, description: 'Super admin access required' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  async getAdmin(@Param('adminId', ParseUUIDPipe) adminId: string) {
    return firstValueFrom(
      this.authClient.send(MESSAGE_PATTERNS.AUTH.ADMIN_GET_ADMIN, { adminId }).pipe(
        timeout(5000),
        retry(2),
        catchError((err) => rpcToHttpError(err)),
      ),
    );
  }

  @Patch(':adminId')
  @ApiOperation({ summary: 'Update admin account (super admin only)' })
  @ApiParam({ name: 'adminId', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: 'Admin account updated' })
  @ApiResponse({ status: 403, description: 'Super admin access required' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  async updateAdmin(
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return firstValueFrom(
      this.authClient.send(MESSAGE_PATTERNS.AUTH.ADMIN_UPDATE_ADMIN, { adminId, ...dto }).pipe(
        timeout(5000),
        retry(1),
        catchError((err) => rpcToHttpError(err)),
      ),
    );
  }

  @Delete(':adminId')
  @ApiOperation({ summary: 'Delete admin account (super admin only)' })
  @ApiParam({ name: 'adminId', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: 'Admin account deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete yourself' })
  @ApiResponse({ status: 403, description: 'Super admin access required' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  async deleteAdmin(
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @CurrentUser('id') requestAdminId: string,
  ) {
    return firstValueFrom(
      this.authClient
        .send(MESSAGE_PATTERNS.AUTH.ADMIN_DELETE_ADMIN, { adminId, requestAdminId })
        .pipe(
          timeout(5000),
          retry(1),
          catchError((err) => rpcToHttpError(err)),
        ),
    );
  }
}
