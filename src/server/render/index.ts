import { PlaceholderRenderer } from "@/server/render/placeholder-renderer";
import { InProcessRenderQueue } from "@/server/render/render-queue";
import type { RenderQueue } from "@/server/render/render-queue";
import type { Renderer } from "@/server/render/renderer";

/**
 * Single composition point for rendering.
 *
 * Step 8 swaps `PlaceholderRenderer` for the FFmpeg implementation here.
 * Moving to a real queue swaps `InProcessRenderQueue` here. Nothing else
 * changes, because everything above depends on the interfaces.
 */
const globalForRender = globalThis as unknown as {
  __renderer?: Renderer;
  __renderQueue?: RenderQueue;
};

export function getRenderer(): Renderer {
  if (!globalForRender.__renderer) {
    globalForRender.__renderer = new PlaceholderRenderer();
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
