import { Card } from "@/components/ui/card";
import type { ProjectStats } from "@/types/project";

interface StatCardProps {
  label: string;
  value: number;
  hint: string;
}

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-foreground-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-xs text-foreground-muted">{hint}</p>
    </Card>
  );
}

export function StatsGrid({ stats }: { stats: ProjectStats }) {
  const cards: StatCardProps[] = [
    {
      label: "Videos Created",
      value: stats.videosCreated,
      hint: `${stats.completed} completed, ${stats.inProgress} in progress`,
    },
    // A "both" project has a Short and a long cut, so it appears in each tile.
    { label: "Shorts", value: stats.shorts, hint: "Projects with a Short cut" },
    {
      label: "Long Videos",
      value: stats.longVideos,
      hint: "Projects with a long cut",
    },
    { label: "Drafts", value: stats.drafts, hint: "Not started yet" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <StatCard key={card.label} {...card} />
      ))}
    </div>
  );
}
