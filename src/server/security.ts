import { AppError } from "@/server/errors";

/**
 * Request-level guards for a single-creator, locally-run app.
 *
 * This app has no user model on purpose: it runs on the creator's own machine
 * and every project belongs to whoever is sitting at it. That is a reasonable
 * position right up until the process is reachable by something else — and
 * since Step 11 it holds an OAuth token that can upload to a real YouTube
 * channel. These two guards are what make "single-user on localhost" an
 * enforced property rather than an assumption.
 *
 * Neither is a substitute for authentication. If this app is ever exposed to
 * more than one person, it needs real accounts; see `assertLocalRequest`.
 */

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super("conflict", message, 403);
  }
}

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isStateChanging(method: string): boolean {
  return STATE_CHANGING.has(method.toUpperCase());
}

/**
 * Rejects cross-origin state changes.
 *
 * Without this, a page on any other site can mutate this app. The gap is
 * narrower than it looks but entirely real: a cross-origin `fetch` carrying
 * `Content-Type: application/json` triggers a CORS preflight the browser
 * blocks, **but** an HTML form with `enctype="text/plain"` is a *simple*
 * request — no preflight — and `Request.json()` parses the body regardless of
 * the declared content type. A form on a malicious page could therefore start
 * a render, create projects, or publish a video to the connected channel.
 *
 * Browsers send `Origin` on every cross-origin POST, form submissions
 * included, so comparing it to the host closes that door. A request with no
 * `Origin` at all is not a browser — curl, a worker script, a health probe —
 * and is allowed through; blocking those would break local tooling without
 * stopping any attack a browser can mount.
 */
export function assertSameOrigin(request: Request): void {
  if (!isStateChanging(request.method)) return;

  // Chrome, Firefox and Safari all send this, and it is unforgeable by page
  // script. When present it is the better signal, because it distinguishes a
  // navigation from a fetch.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new ForbiddenError(
      "Cross-site requests are not allowed to change anything in this app.",
    );
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  const host = request.headers.get("host");
  if (!host) {
    throw new ForbiddenError("This request is missing a Host header.");
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError("This request has a malformed Origin header.");
  }

  if (originHost !== host) {
    throw new ForbiddenError(
      "Cross-origin requests are not allowed to change anything in this app.",
    );
  }
}

/**
 * Refuses to serve anything to a non-local caller.
 *
 * The app has no authentication, so reachability *is* authorization: anyone
 * who can open the port can delete every project and publish to the connected
 * YouTube channel. Rather than trusting the operator to bind correctly, every
 * request has to arrive addressed to a loopback host.
 *
 * `ALLOW_REMOTE_ACCESS=true` is the deliberate opt-out, for someone who has
 * put their own authentication in front (a reverse proxy with auth, a private
 * network, an SSH tunnel). It is an explicit statement that the exposure is
 * intended — which is exactly what was missing before.
 */
export function assertLocalRequest(request: Request): void {
  if (process.env.ALLOW_REMOTE_ACCESS === "true") return;

  const host = request.headers.get("host");
  if (!host) return; // Not an HTTP/1.1 browser request; nothing to check.

  if (isLoopbackHost(host)) return;

  throw new ForbiddenError(
    "This installation only serves localhost. It has no authentication, so anyone who can reach it can delete projects and publish to the connected YouTube channel. Put authentication in front of it and set ALLOW_REMOTE_ACCESS=true to serve other hosts.",
  );
}

/** `localhost:3000`, `127.0.0.1:3000`, `[::1]:3000`, and the bare forms. */
export function isLoopbackHost(host: string): boolean {
  // Strip the port. An IPv6 literal is bracketed, so split on the closing
  // bracket first; otherwise the colon before the port is the only one.
  const hostname = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : (host.split(":")[0] ?? host);

  const normalised = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  return (
    normalised === "localhost" ||
    normalised === "::1" ||
    normalised === "0:0:0:0:0:0:0:1" ||
    // A complete IPv4 literal in 127.0.0.0/8, anchored at both ends. A prefix
    // match would accept `127.0.0.1.evil.example`, a name an attacker can
    // register and point wherever they like.
    isLoopbackIpv4(normalised)
  );
}

function isLoopbackIpv4(hostname: string): boolean {
  const octets = hostname.split(".");
  if (octets.length !== 4) return false;

  const numbers = octets.map((octet) =>
    /^\d{1,3}$/.test(octet) ? Number(octet) : NaN,
  );

  if (numbers.some((value) => Number.isNaN(value) || value > 255)) return false;

  return numbers[0] === 127;
}
