interface StatusBadgeProps {
  status: "online" | "offline" | "active" | "inactive" | "assigned" | "unassigned" | "good" | "faulty";
}

const styles: Record<string, string> = {
  online: "bg-success/15 text-success",
  active: "bg-success/15 text-success",
  assigned: "bg-info/15 text-info",
  good: "bg-success/15 text-success",
  offline: "bg-destructive/15 text-destructive",
  inactive: "bg-muted text-muted-foreground",
  unassigned: "bg-warning/15 text-warning",
  faulty: "bg-destructive/15 text-destructive",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles[status] ?? "bg-muted text-muted-foreground"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "online" || status === "active" || status === "assigned" || status === "good" ? "bg-success" : status === "offline" || status === "faulty" ? "bg-destructive" : "bg-muted-foreground"}`} />
      {status}
    </span>
  );
}
