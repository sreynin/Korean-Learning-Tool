import { cn } from "@/lib/utils/cn";

interface ProgressProps {
  /** Completed units. */
  value: number;
  /** Total units. Must be greater than zero. */
  max: number;
  label: string;
  className?: string;
}

export function Progress({ value, max, label, className }: ProgressProps) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-surface-muted",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-brand transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
