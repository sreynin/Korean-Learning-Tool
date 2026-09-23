import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, ValidationError, isAppError } from "@/server/errors";
import type { ApiFailure, ApiSuccess, FieldIssue } from "@/types/api";

export function jsonOk<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonCreated<T>(data: T): NextResponse<ApiSuccess<T>> {
  return jsonOk(data, 201);
}

export function jsonError(error: AppError): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
      },
    },
    { status: error.status },
  );
}

/**
 * Wraps a route handler so unexpected throws never leak a stack trace to the
 * client. Known `AppError`s keep their status; anything else becomes a 500.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (isAppError(error)) {
        return jsonError(error);
      }
      console.error("[api] unhandled error", error);
      return jsonError(
        new AppError("internal_error", "Something went wrong on our end.", 500),
      );
    }
  };
}

/** Parses a JSON request body against a schema, throwing `ValidationError`. */
export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      "The submitted data is invalid.",
      toFieldIssues(result.error),
    );
  }
  return result.data;
}

export function toFieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}
