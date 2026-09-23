import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { PROJECT_STATUSES } from "@/types/project";
import type { ProjectListFilters, ProjectStatus } from "@/types/project";
import { STATUS_META } from "@/lib/constants";

/**
 * Filtering is driven by the URL rather than client state, so a filtered view
 * is shareable and the list stays server-rendered.
 */
export function ProjectFilters({ filters }: { filters: ProjectListFilters }) {
  const options: { label: string; status?: ProjectStatus }[] = [
    { label: "All" },
    ...PROJECT_STATUSES.map((status) => ({
      label: STATUS_META[status].label,
      status,
    })),
  ];

  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = filters.status === option.status;
          return (
            <Link
              key={option.label}
              href={buildHref({ ...filters, status: option.status })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand text-brand-foreground"
                  : "bg-surface text-foreground-muted border border-border-subtle hover:text-foreground",
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      <form action="/projects" className="flex gap-2">
        {filters.status ? (
          <input type="hidden" name="status" value={filters.status} />
        ) : null}
        <input
          type="search"
          name="search"
          defaultValue={filters.search ?? ""}
          placeholder="Search title or topic"
          aria-label="Search projects"
          className="h-9 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-foreground placeholder:text-foreground-muted sm:w-60"
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-lg border border-border-subtle bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-muted"
        >
          Search
        </button>
      </form>
    </div>
  );
}

function buildHref(filters: ProjectListFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.format) params.set("format", filters.format);
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}
