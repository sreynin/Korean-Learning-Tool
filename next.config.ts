import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Both packages exist to hand the renderer a path to a native executable.
   * Bundling them makes the build try to parse the binary itself, so they are
   * required at runtime instead.
   */
  serverExternalPackages: ["ffmpeg-static", "@ffprobe-installer/ffprobe"],

  /**
   * Defence in depth for an app with no authentication.
   *
   * The CSP is deliberately strict on what can *leave*: `frame-ancestors
   * 'none'` stops another page embedding this one and driving it, and
   * `form-action 'self'` stops a submission being redirected off-site. It is
   * deliberately loose on `script-src`, because Next's App Router injects
   * inline bootstrap scripts and Tailwind v4 injects inline styles — a
   * nonce-based policy is possible but needs middleware on every response,
   * which is a larger change than this pass should make.
   *
   * `connect-src` allows blob: and data: because the preview builds object
   * URLs for generated audio.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            // Nothing here uses a camera, a microphone, or geolocation.
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
              "font-src 'self' data:",
              "connect-src 'self' blob: data:",
              // The OAuth flow navigates to Google; nothing else may be framed.
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
