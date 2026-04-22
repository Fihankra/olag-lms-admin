import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
}

export function StatsCard({ title, value, subtitle, icon: Icon, trend }: StatsCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-muted-foreground truncate">{title}</p>
          <p className="text-xl sm:text-2xl font-bold mt-0.5 sm:mt-1 tabular-nums">{value}</p>
          {subtitle && <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
          {trend && (
            <p className={`text-[11px] sm:text-xs mt-0.5 ${trend.positive ? "text-success" : "text-destructive"}`}>
              {trend.positive ? "+" : ""}{trend.value}% from last week
            </p>
          )}
        </div>
        <div className="p-1.5 sm:p-2 rounded-md bg-primary/10 shrink-0">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
        </div>
      </div>
    </div>
  );
}
