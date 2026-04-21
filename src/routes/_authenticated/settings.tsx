import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings — OLAG LMS" },
      { name: "description", content: "System configuration and preferences" },
    ],
  }),
});

function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" description="System configuration and preferences" />
      <div className="bg-card rounded-lg border border-border p-8 flex flex-col items-center justify-center text-center">
        <Settings className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Settings Coming Soon</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Screen time controls, global kiosk toggle, and other system configurations will be available here.
        </p>
      </div>
    </div>
  );
}
