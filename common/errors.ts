import { APIError } from "encore.dev/api";

// Standard error codes for the application
export enum ErrorCode {
  INVALID_ARGUMENT = "invalid_argument",
  UNAUTHENTICATED = "unauthenticated", 
  PERMISSION_DENIED = "permission_denied",
  NOT_FOUND = "not_found",
  ALREADY_EXISTS = "already_exists",
  FAILED_PRECONDITION = "failed_precondition",
  INTERNAL = "internal",
}

// Custom error class that extends Encore's APIError
export class AppError extends APIError {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, details);
  }
}

// Helper functions for common error types
export const AuthenticationRequiredError = (message = "Authentication required") =>
  new AppError(ErrorCode.UNAUTHENTICATED, message);

export const PermissionDeniedError = (message = "You do not have permission to access this resource") =>
  new AppError(ErrorCode.PERMISSION_DENIED, message);

export const NotFoundError = (resource: string) =>
  new AppError(ErrorCode.NOT_FOUND, `${resource} not found`);

export const AlreadyExistsError = (resource: string) =>
  new AppError(ErrorCode.ALREADY_EXISTS, `${resource} already exists`);

export const InvalidArgumentError = (message: string) =>
  new AppError(ErrorCode.INVALID_ARGUMENT, message);

export const InternalError = (message = "Internal server error") =>
  new AppError(ErrorCode.INTERNAL, message);

export const InsufficientQuantityError = () =>
  new AppError(ErrorCode.FAILED_PRECONDITION, "Insufficient quantity available");

export const ReferencedInOrdersError = (orderCount: number) =>
  new AppError(
    ErrorCode.FAILED_PRECONDITION, 
    `Cannot delete part that is referenced in orders. Order count: ${orderCount}`
  );