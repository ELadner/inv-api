// Standard response helper functions following CLAUDE.md specification
export interface StandardResponse<T = any> {
  success: boolean;
  data?: T;
  meta?: any;
  error?: string;
}

export interface PaginationMeta {
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface PaginatedResponse<T = any> extends StandardResponse<T> {
  meta?: PaginationMeta;
}

/**
 * Create a successful response
 */
export function successResponse<T>(data?: T, meta?: any): StandardResponse<T> {
  const response: StandardResponse<T> = {
    success: true,
  };
  
  if (data !== null && data !== undefined) {
    response.data = data;
  }
  
  if (meta && Object.keys(meta).length > 0) {
    response.meta = meta;
  }
  
  return response;
}

/**
 * Create a paginated successful response
 */
export function paginatedResponse<T>(
  data: T,
  pagination: PaginationMeta['pagination']
): PaginatedResponse<T> {
  return {
    success: true,
    data,
    meta: { pagination }
  };
}

/**
 * Create an error response
 */
export function errorResponse(error: string): StandardResponse {
  return {
    success: false,
    error
  };
}