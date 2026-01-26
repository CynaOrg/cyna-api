/**
 * JWT Payload Interface
 * Defines the structure of the JWT token payload
 */
export interface JwtPayload {
  sub: string;
  email: string;
  type: 'user' | 'admin';
  role?: string;
  iat?: number;
  exp?: number;
}

/**
 * Request User Interface
 * Represents the user attached to the request after JWT validation
 */
export interface RequestUser {
  id: string;
  email: string;
  type: 'user' | 'admin';
  role?: string;
}
