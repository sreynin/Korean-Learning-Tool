/**
 * Every JSON response from /api uses this envelope so the client can
 * discriminate success from failure without inspecting HTTP status codes.
 */

export const API_ERROR_CODES = [
  "validation_error",
  "not_found",
  "conflict",
  "not_implemented",
  "generation_failed",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface FieldIssue {
  /** Dot-separated path to the offending field, e.g. "title". */
  field: string;
  message: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    issues?: FieldIssue[];
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
