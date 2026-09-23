import { writeRenderFile } from "@/server/render/render-storage";
import { totalSceneDuration } from "@/types/scene";
import type { RenderRequest, RenderResult, Renderer } from "@/server/render/renderer";

export const PLACEHOLDER_RENDERER_NAME = "placeholder";

/**
 * Progress checkpoints a real encoder would also pass through. 100 is not one
 * of them: it is reported once the output file exists, so a write that fails
 * cannot leave a job recorded as having failed at 100%.
 */
const STEPS = [10, 25, 50, 75];

/**
 * Stands in for the video renderer until Step 8 builds it.
 *
 * It does NOT encode video. It walks the same progress checkpoints an encoder
 * would and writes a small manifest describing what a real render would have
 * produced, so the job lifecycle, progress reporting, storage, and failure
 * handling are all exercised end to end without FFmpeg.
 *
 * Replacing this with the FFmpeg implementation should require no change
 * outside this file.
 */
export class PlaceholderRenderer implements Renderer {
  readonly name = PLACEHOLDER_RENDERER_NAME;

  private readonly stepDelayMs: number;

  constructor(options: { stepDelayMs?: number } = {}) {
    this.stepDelayMs = options.stepDelayMs ?? 150;
  }

  async render(request: RenderRequest): Promise<RenderResult> {
    const { project, onProgress, signal } = request;
    const scenes = project.scenes?.scenes ?? [];

    for (const percent of STEPS) {
      if (signal?.aborted) {
        throw new Error("Render cancelled.");
      }

      await delay(this.stepDelayMs);
      // Reported outside any transaction — one short write per checkpoint.
      await onProgress(percent);
    }

    const manifest = {
      note: "Placeholder output. Step 8 replaces this with an encoded video.",
      projectId: project.id,
      title: project.title,
      format: project.format,
      sceneCount: scenes.length,
      totalDurationSeconds: totalSceneDuration(scenes),
      captionSettings: project.captionSettings,
      scenesWithAudio: scenes.filter((scene) => scene.audio !== null).length,
      renderedAt: new Date().toISOString(),
    };

    const bytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    const outputFileName = await writeRenderFile(bytes, "json");
    await onProgress(100);

    return { outputFileName };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
