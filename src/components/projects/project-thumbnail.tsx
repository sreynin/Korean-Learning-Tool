import { backgroundGradient } from "@/lib/preview";
import { cn } from "@/lib/utils/cn";
import type { VideoProject } from "@/types/project";

/**
 * A project's picture in the library.
 *
 * A finished render has a real still taken from the video. Everything else
 * falls back to the same deterministic gradient the preview and the renderer
 * draw, with the first scene's Korean on it — so the card looks like what the
 * video will look like, rather than like an empty box.
 */
export function ProjectThumbnail({
  project,
  className,
}: {
  project: VideoProject;
  className?: string;
}) {
  const scene = project.scenes?.scenes.find((entry) => entry.koreanText);
  const seed = scene?.background || scene?.id || project.id;

  return (
    <div
      className={cn(
        "relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-surface-muted",
        className,
      )}
      style={project.posterUrl ? undefined : { background: backgroundGradient(seed) }}
    >
      {project.posterUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element --
           the poster is already a 640px JPEG our own route serves from disk,
           so next/image would re-encode a file that is the right size. */
        <img
          src={project.posterUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <span
          lang="ko"
          aria-hidden="true"
          className="line-clamp-2 px-3 text-center text-lg font-bold text-white/90 drop-shadow"
        >
          {scene?.koreanText ?? ""}
        </span>
      )}
    </div>
  );
}
