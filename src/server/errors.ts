import type { ApiErrorCode, FieldIssue } from "@/types/api";

/**
 * Errors thrown by the service layer. The HTTP boundary translates these into
 * the API envelope; nothing below the boundary needs to know about status codes
 * beyond what is declared here.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly issues?: FieldIssue[];

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    issues?: FieldIssue[],
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.issues = issues;
  }
}

export class ValidationError extends AppError {
  constructor(message = "The submitted data is invalid.", issues?: FieldIssue[]) {
    super("validation_error", message, 400, issues);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource does not exist.") {
    super("not_found", message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "The request conflicts with the current state.") {
    super("conflict", message, 409);
  }
}

/** For pipeline stages that are modelled but not built yet. */
export class NotImplementedError extends AppError {
  constructor(feature: string) {
    super("not_implemented", `${feature} is not available yet.`, 501);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
