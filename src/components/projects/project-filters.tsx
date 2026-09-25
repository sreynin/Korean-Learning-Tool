import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { LEVEL_META, STATUS_META } from "@/lib/constants";
import {
  PROFICIENCY_LEVELS,
  PROJECT_STATUSES,
  VIDEO_FORMATS,
} from "@/types/project";
import type { ProjectListFilters } from "@/types/project";

/**
 * Filtering is driven by the URL rather than client state, so a filtered view
 * is shareable, the list stays server-rendered, and every filter is a plain
 * link that works before any JavaScript loads.
 */
export function ProjectFilters({ filters }: { filters: ProjectListFilters }) {
  const isFiltered = Boolean(filters.status || filters.format || filters.level);

  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-2">
          <FilterRow label="Type">
            <FilterLink
              filters={filters}
              change={{ format: undefined, level: undefined, status: undefined }}
              active={!isFiltered}
            >
              All
            </FilterLink>

            {VIDEO_FORMATS.filter((value) => value !== "both").map((value) => (
              <FilterLink
                key={value}
                filters={filters}
                change={{ format: filters.format === value ? undefined : value }}
                active={filters.format === value}
              >
                {value === "shorts" ? "Shorts" : "Long videos"}
              </FilterLink>
            ))}

            {PROFICIENCY_LEVELS.map((value) => (
              <FilterLink
                key={value}
                filters={filters}
                change={{ level: filters.level === value ? undefined : value }}
                active={filters.level === value}
              >
                {LEVEL_META[value].label}
              </FilterLink>
            ))}
          </FilterRow>

          <FilterRow label="Stage">
            {PROJECT_STATUSES.map((value) => (
              <FilterLink
                key={value}
                filters={filters}
                change={{ status: filters.status === value ? undefined : value }}
                active={filters.status === value}
              >
                {STATUS_META[value].label}
              </FilterLink>
            ))}
          </FilterRow>
        </div>

        <form action="/projects" className="flex shrink-0 gap-2">
          {/* Searching keeps whatever is already filtered. */}
          {filters.status ? (
            <input type="hidden" name="status" value={filters.status} />
          ) : null}
          {filters.format ? (
            <input type="hidden" name="format" value={filters.format} />
          ) : null}
          {filters.level ? (
            <input type="hidden" name="level" value={filters.level} />
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

      {filters.search ? (
        <p className="text-sm text-foreground-muted">
          Showing matches for &ldquo;{filters.search}&rdquo;.{" "}
          <Link
            href={buildHref({ ...filters, search: undefined })}
            className="font-medium text-foreground underline underline-offset-2"
          >
            Clear search
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-xs font-medium tracking-wide text-foreground-muted uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterLink({
  filters,
  change,
  active,
  children,
}: {
  filters: ProjectListFilters;
  change: Partial<ProjectListFilters>;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={buildHref({ ...filters, ...change })}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-full px-3 py-1 text-sm font-medium transition-colors",
        active
          ? "bg-brand text-brand-foreground"
          : "border border-border-subtle bg-surface text-foreground-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function buildHref(filters: ProjectListFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.format) params.set("format", filters.format);
  if (filters.level) params.set("level", filters.level);
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}
