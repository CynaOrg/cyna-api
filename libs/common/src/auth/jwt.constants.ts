/**
 * JWT identity claims shared by every service that signs or verifies tokens.
 *
 * - issuer (`iss`) identifies the auth-service emitting the token.
 * - audience (`aud`) identifies the intended consumer (the gateway / clients).
 * - algorithm is pinned to HS256 so a stolen token from another deployment
 *   sharing the same secret accidentally cannot be reused.
 *
 * A change here must be deployed atomically to auth-service and api-gateway
 * because mismatched issuer / audience will invalidate every active session.
 */
export const JWT_ISSUER = 'cyna-api';
export const JWT_AUDIENCE = 'cyna-clients';
export const JWT_ALGORITHM = 'HS256' as const;
