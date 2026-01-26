import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import {
  IS_PUBLIC_KEY,
  TokenInvalidException,
  TokenExpiredException,
} from '@cyna-api/common';
import { JwtPayload, RequestUser } from '../interfaces';

/**
 * JWT Auth Guard
 * Validates JWT tokens and attaches user data to the request
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Check @Public() decorator
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2. Extract token from Authorization header
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new TokenInvalidException();
    }

    // 3. Verify JWT
    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        throw new Error('JWT_SECRET not configured');
      }

      const payload = jwt.verify(token, secret) as JwtPayload;

      // 4. Attach user to request
      const user: RequestUser = {
        id: payload.sub,
        email: payload.email,
        type: payload.type,
        role: payload.role,
      };
      request.user = user;

      return true;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new TokenExpiredException();
      }
      throw new TokenInvalidException();
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const authorization = request.headers?.authorization;
    if (!authorization) return undefined;

    const [type, token] = authorization.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
