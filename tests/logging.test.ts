import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { redactPaths } from "@/server/logger";

/**
 * FFmpeg writes its working paths into stderr, that stderr tail becomes a
 * job's `errorMessage`, and that message is stored and served to the browser.
 * The installation's directory layout — including the creator's home
 * directory name — was reaching anything that could read the API.
 */
describe("path redaction", () => {
  test("strips an absolute POSIX path but keeps the file name", () => {
    const redacted = redactPaths(
      "Error opening /Users/someone/Desktop/Korean Learning Tool/data/renders/x.mp4",
    );

    assert.ok(!redacted.includes("/Users/someone"), "the home directory is gone");
    assert.ok(redacted.includes("x.mp4"), "the file name explains the failure");
  });

  test("strips a Windows drive path", () => {
    const redacted = redactPaths("cannot read C:\\Users\\someone\\data\\clip.wav");

    assert.ok(!redacted.includes("Users\\someone"));
    assert.ok(redacted.includes("clip.wav"));
  });

  test("handles several paths in one message", () => {
    const redacted = redactPaths(
      "concat /tmp/work/scene-0.mp4 + /tmp/work/scene-1.mp4 failed",
    );

    assert.ok(!redacted.includes("/tmp/work"));
    assert.ok(redacted.includes("scene-0.mp4"));
    assert.ok(redacted.includes("scene-1.mp4"));
  });

  test("leaves ordinary text alone", () => {
    const message = "FFmpeg exited with code 1. Invalid argument";
    assert.equal(redactPaths(message), message);
  });

  test("does not mangle a URL's host", () => {
    // Publish errors legitimately name YouTube endpoints; those are not
    // filesystem paths and are useful to keep readable.
    const redacted = redactPaths("POST https://www.googleapis.com/upload/v3 failed");
    assert.ok(redacted.includes("googleapis.com"), redacted);
  });
});
