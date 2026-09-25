import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import {
  assertLocalRequest,
  assertSameOrigin,
  isLoopbackHost,
  isStateChanging,
} from "@/server/security";

/**
 * These guards are what stand in for authentication, so they are tested the
 * way an auth layer would be: by what they refuse.
 */

function req(
  method: string,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost:3000/api/projects", { method, headers });
}

describe("cross-origin state changes", () => {
  test("a same-origin mutation is allowed", () => {
    assert.doesNotThrow(() =>
      assertSameOrigin(
        req("POST", { host: "localhost:3000", origin: "http://localhost:3000" }),
      ),
    );
  });

  test("a cross-origin mutation is refused", () => {
    assert.throws(
      () =>
        assertSameOrigin(
          req("POST", { host: "localhost:3000", origin: "https://evil.example" }),
        ),
      /Cross-origin/,
    );
  });

  test("a cross-site form post is refused by Sec-Fetch-Site alone", () => {
    // The header browsers send on a form submission from another page. It is
    // set by the browser and cannot be forged from page script.
    assert.throws(
      () =>
        assertSameOrigin(
          req("POST", { host: "localhost:3000", "sec-fetch-site": "cross-site" }),
        ),
      /Cross-site/,
    );
  });

  test("a same-site navigation is allowed", () => {
    assert.doesNotThrow(() =>
      assertSameOrigin(
        req("POST", { host: "localhost:3000", "sec-fetch-site": "same-origin" }),
      ),
    );
  });

  test("a direct navigation (Sec-Fetch-Site: none) is allowed", () => {
    assert.doesNotThrow(() =>
      assertSameOrigin(req("POST", { host: "localhost:3000", "sec-fetch-site": "none" })),
    );
  });

  test("a request with no Origin at all is allowed — that is not a browser", () => {
    // curl, the render worker, a health probe. Blocking these would break
    // local tooling without stopping any attack a browser can mount.
    assert.doesNotThrow(() => assertSameOrigin(req("POST", { host: "localhost:3000" })));
  });

  test("reads are never blocked, whatever their origin", () => {
    assert.doesNotThrow(() =>
      assertSameOrigin(
        req("GET", { host: "localhost:3000", origin: "https://evil.example" }),
      ),
    );
  });

  test("a malformed Origin is refused rather than parsed loosely", () => {
    assert.throws(() =>
      assertSameOrigin(req("POST", { host: "localhost:3000", origin: "not a url" })),
    );
  });

  test("only state-changing methods are guarded", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal(isStateChanging(method), true, method);
    }
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      assert.equal(isStateChanging(method), false, method);
    }
  });
});

describe("local-only serving", () => {
  test("loopback hosts are recognised in every form", () => {
    for (const host of [
      "localhost",
      "localhost:3000",
      "127.0.0.1",
      "127.0.0.1:3000",
      "127.5.5.5:3000",
      "[::1]:3000",
      "[::1]",
    ]) {
      assert.equal(isLoopbackHost(host), true, host);
    }
  });

  test("a routable host is not loopback", () => {
    for (const host of [
      "example.com",
      "example.com:3000",
      "192.168.1.10:3000",
      "10.0.0.4",
      // Deliberately adversarial: a name that merely starts with the string.
      "localhost.evil.example",
      "127.0.0.1.evil.example",
    ]) {
      assert.equal(isLoopbackHost(host), false, host);
    }
  });

  test("a remote request is refused while the app has no authentication", () => {
    delete process.env.ALLOW_REMOTE_ACCESS;
    assert.throws(
      () => assertLocalRequest(req("GET", { host: "app.example.com" })),
      /only serves localhost/,
    );
  });

  test("a local request is served", () => {
    delete process.env.ALLOW_REMOTE_ACCESS;
    assert.doesNotThrow(() => assertLocalRequest(req("GET", { host: "localhost:3000" })));
  });

  test("ALLOW_REMOTE_ACCESS is the deliberate opt-out", () => {
    process.env.ALLOW_REMOTE_ACCESS = "true";
    try {
      assert.doesNotThrow(() =>
        assertLocalRequest(req("GET", { host: "app.example.com" })),
      );
    } finally {
      delete process.env.ALLOW_REMOTE_ACCESS;
    }
  });
});

describe("every route handler can be guarded", () => {
  /**
   * The guards read the `Request`, so a handler that does not accept one is
   * silently unguarded. That is invisible in review and catastrophic on a
   * mutation, so it is asserted structurally rather than trusted.
   */
  test("no route handler omits its Request argument", () => {
    const offenders: string[] = [];

    for (const file of routeFiles(path.join(process.cwd(), "src/app/api"))) {
      const source = readFileSync(file, "utf8");

      // `route(async () => {` — a handler taking nothing at all.
      if (/route\(\s*async\s*\(\s*\)\s*=>/.test(source)) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }

    assert.deepEqual(
      offenders,
      [],
      "these handlers cannot be origin-checked because they take no Request",
    );
  });
});

function routeFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...routeFiles(full));
    } else if (entry === "route.ts") {
      found.push(full);
    }
  }

  return found;
}
