import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from '../interfaces';

/**
 * Optional JWT Auth Guard
 * Tries to extract and validate the JWT, but does NOT reject if absent or invalid.
 * If valid → request.user is set.
 * If absent/invalid → request.user remains undefined, request passes through.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(OptionalJwtAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) return true;

    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        this.logger.warn('JWT_SECRET not configured, treating as guest');
        return true;
      }

      const payload = jwt.verify(token, secret) as JwtPayload;

      request.user = {
        id: payload.sub,
        email: payload.email,
        type: payload.type,
        role: payload.role,
      };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError')
      ) {
        // Token invalid or expired — treat as guest (normal case)
      } else {
        // Unexpected error (DI issue, etc.) — log it
        const message = error instanceof Error ? error.message : 'Unknown error';
        const stack = error instanceof Error ? error.stack : undefined;
        this.logger.error(`Unexpected error in OptionalJwtAuthGuard: ${message}`, stack);
      }
    }

    return true;
  }

  private extractTokenFromHeader(request: {
    headers?: { authorization?: string };
  }): string | undefined {
    const authorization = request.headers?.authorization;
    if (!authorization) return undefined;

    const [type, token] = authorization.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
