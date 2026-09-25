import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, ValidationError, isAppError } from "@/server/errors";
import { assertLocalRequest, assertSameOrigin } from "@/server/security";
import type { ApiFailure, ApiSuccess, FieldIssue } from "@/types/api";
import { createLogger } from "@/server/logger";

const log = createLogger("api");

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
 * client, and so every request passes the same guards.
 *
 * The guards run before the handler, which is what makes them impossible to
 * forget: a new route gets them by being a route.
 *
 * They need the `Request` to read, so **every handler takes one**, including
 * the ones that ignore it. A mutating handler written without it would be
 * silently unguarded, which is the exact failure this wrapper exists to
 * prevent, and `tests/security.test.ts` asserts no route omits it.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      const request = args.find(
        (arg): arg is Request => arg instanceof Request,
      );

      if (request) {
        assertLocalRequest(request);
        assertSameOrigin(request);
      }

      return await handler(...args);
    } catch (error) {
      if (isAppError(error)) {
        return jsonError(error);
      }
      log.error("unhandled error", error);
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
  // `Request.json()` parses the body whatever the content type claims, which
  // is what let an HTML form with `enctype="text/plain"` reach these routes as
  // a *simple* cross-origin request — no CORS preflight to stop it. Requiring
  // a JSON content type forces any cross-origin caller into a preflight the
  // browser will refuse, independently of the Origin check in `route()`.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ValidationError(
      "Request body must be sent as application/json.",
    );
  }

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
