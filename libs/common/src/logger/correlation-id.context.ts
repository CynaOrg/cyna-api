import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  correlationId: string;
  userId?: string;
  adminId?: string;
  requestPath?: string;
  requestMethod?: string;
}

/**
 * AsyncLocalStorage for request context propagation
 * Allows correlation ID to be available anywhere in the request lifecycle
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get current correlation ID from context
 */
export function getCorrelationId(): string | undefined {
  return requestContextStorage.getStore()?.correlationId;
}

/**
 * Get current request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Run code within a request context
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}
