// Temporary stubs for Encore modules to enable testing during migration
// These will be replaced with actual Encore imports once the runtime is set up

export interface APICallMeta {
  method: string;
  path: string;
  auth?: boolean;
}

export interface APIError extends Error {
  code: string;
  message: string;
  details?: any;
}

export class APIError extends Error {
  code: string;
  details?: any;
  
  constructor(code: string, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// Mock api decorator
export function api<T extends (...args: any[]) => any>(
  meta: APICallMeta,
  handler: T
): T {
  // For testing, just return the handler function
  return handler;
}

// Mock auth handler
export function authHandler<T>(
  handler: (token: string) => Promise<T | null>
): {
  data: () => T | null;
} {
  // For testing, return a mock that always returns null (no auth)
  return {
    data: () => null
  };
}