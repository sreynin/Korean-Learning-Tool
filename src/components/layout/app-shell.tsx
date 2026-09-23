import Link from "next/link";
import type { ReactNode } from "react";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ButtonLink } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

/**
 * Application frame: brand, primary navigation, and the page slot.
 * On narrow screens the sidebar collapses into a horizontal bar under the
 * header rather than a drawer — there are only four destinations.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-border-subtle bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-foreground"
            >
              한
            </span>
            <span className="text-sm font-semibold text-foreground">
              {APP_NAME}
            </span>
          </Link>

          <ButtonLink href="/create" size="sm">
            Create New Video
          </ButtonLink>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-10">
        <aside className="lg:w-52 lg:shrink-0">
          <div className="lg:sticky lg:top-22">
            <SidebarNav />
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-12">{children}</main>
      </div>
    </div>
  );
}
