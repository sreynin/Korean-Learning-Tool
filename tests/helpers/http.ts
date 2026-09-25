/**
 * Requests shaped the way a real caller shapes them.
 *
 * `src/lib/api-client.ts` sets `Content-Type: application/json` on every
 * request, and `parseJsonBody` now requires it — that header is what forces a
 * cross-origin caller into a CORS preflight instead of sneaking a body through
 * as a simple `text/plain` form post. A test that omits it is not exercising
 * the route the app actually calls, so these helpers put it back.
 */
export function jsonRequest(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
