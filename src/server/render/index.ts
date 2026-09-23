import { FfmpegRenderer } from "@/server/render/ffmpeg-renderer";
import { InProcessRenderQueue } from "@/server/render/render-queue";
import type { RenderQueue } from "@/server/render/render-queue";
import type { Renderer } from "@/server/render/renderer";

/**
 * Single composition point for rendering.
 *
 * Moving to a real queue swaps `InProcessRenderQueue` here, and a different
 * encoder swaps `FfmpegRenderer`. Nothing else changes, because everything
 * above depends on the interfaces.
 */
const globalForRender = globalThis as unknown as {
  __renderer?: Renderer;
  __renderQueue?: RenderQueue;
};

export function getRenderer(): Renderer {
  if (!globalForRender.__renderer) {
    globalForRender.__renderer = new FfmpegRenderer();
  }
  return globalForRender.__renderer;
}

export function getRenderQueue(): RenderQueue {
  if (!globalForRender.__renderQueue) {
    globalForRender.__renderQueue = new InProcessRenderQueue({
      renderer: getRenderer(),
    });
  }
  return globalForRender.__renderQueue;
}

export type { RenderQueue, Renderer };
