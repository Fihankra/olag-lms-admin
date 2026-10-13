import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { AdminOnly } from "../../components/AdminOnly";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AdminOnly>
      <div>
        <PageHeader title="Settings" description="System configuration and preferences" />

        <div className="bg-card rounded-lg border border-border p-6 max-w-lg">
          <h2 className="text-base font-semibold mb-1">Device Reports</h2>
          <p className="text-sm text-muted-foreground">
            Form masters can submit device reports for today or any earlier date, so there is no
            report week or deadline to configure.
          </p>
        </div>
      </div>
    </AdminOnly>
  );
}
