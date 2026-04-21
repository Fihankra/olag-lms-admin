import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { Settings, Save } from "lucide-react";
import { AdminOnly } from "../../components/AdminOnly";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings — OLAG LMS" },
      { name: "description", content: "System configuration and preferences" },
    ],
  }),
});

const DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

function SettingsPage() {
  const [deadlineDay, setDeadlineDay] = useState(5);
  const [deadlineHour, setDeadlineHour] = useState(23);
  const [deadlineMinute, setDeadlineMinute] = useState(59);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from("settings")
      .select("value")
      .eq("key", "report_deadline")
      .single()
      .then(({ data }) => {
        if (data?.value) {
          const v = data.value as Record<string, number>;
          if (v.day != null) setDeadlineDay(v.day);
          if (v.hour != null) setDeadlineHour(v.hour);
          if (v.minute != null) setDeadlineMinute(v.minute);
        }
      });
  }, []);

  async function saveDeadline() {
    setSaving(true);
    const value = { day: deadlineDay, hour: deadlineHour, minute: deadlineMinute };

    // Upsert by key
    const { data: existing } = await supabase
      .from("settings")
      .select("id")
      .eq("key", "report_deadline")
      .single();

    if (existing) {
      await supabase.from("settings").update({ value }).eq("id", existing.id);
    } else {
      await supabase.from("settings").insert({ key: "report_deadline", value });
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AdminOnly>
      <div>
        <PageHeader title="Settings" description="System configuration and preferences" />

        <div className="bg-card rounded-lg border border-border p-6 max-w-lg">
          <h2 className="text-base font-semibold mb-1">Report Deadline</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Set the weekly cutoff after which teachers can no longer submit or edit reports.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Day</label>
              <select
                value={deadlineDay}
                onChange={(e) => setDeadlineDay(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
              >
                {DAY_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Hour</label>
              <select
                value={deadlineHour}
                onChange={(e) => setDeadlineHour(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Minute</label>
              <select
                value={deadlineMinute}
                onChange={(e) => setDeadlineMinute(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
              >
                {[0, 15, 30, 45, 59].map((m) => (
                  <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={saveDeadline}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : saved ? "Saved!" : "Save Deadline"}
          </button>
        </div>
      </div>
    </AdminOnly>
  );
}
