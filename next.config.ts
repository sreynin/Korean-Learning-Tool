import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Both packages exist to hand the renderer a path to a native executable.
   * Bundling them makes the build try to parse the binary itself, so they are
   * required at runtime instead.
   */
  serverExternalPackages: ["ffmpeg-static", "@ffprobe-installer/ffprobe"],
};

export default nextConfig;
