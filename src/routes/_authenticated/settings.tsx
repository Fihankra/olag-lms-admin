import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { Save } from "lucide-react";
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
  // Week start day (1=Mon..7=Sun)
  const [weekStartDay, setWeekStartDay] = useState(2); // default Tuesday

  // Deadline config
  const [deadlineDay, setDeadlineDay] = useState(2); // default Tuesday
  const [deadlineHour, setDeadlineHour] = useState(23);
  const [deadlineMinute, setDeadlineMinute] = useState(59);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from("settings")
      .select("key, value")
      .in("key", ["report_deadline", "report_week_start"])
      .then(({ data }) => {
        if (!data) return;
        for (const row of data) {
          const v = row.value as Record<string, number>;
          if (row.key === "report_deadline") {
            if (v.day != null) setDeadlineDay(v.day);
            if (v.hour != null) setDeadlineHour(v.hour);
            if (v.minute != null) setDeadlineMinute(v.minute);
          }
          if (row.key === "report_week_start") {
            if (v.day != null) setWeekStartDay(v.day);
          }
        }
      });
  }, []);

  async function saveSettings() {
    setSaving(true);

    // Save week start day
    const startValue = { day: weekStartDay };
    const { data: existingStart } = await supabase
      .from("settings")
      .select("id")
      .eq("key", "report_week_start")
      .single();

    if (existingStart) {
      await supabase.from("settings").update({ value: startValue }).eq("id", existingStart.id);
    } else {
      await supabase.from("settings").insert({ key: "report_week_start", value: startValue });
    }

    // Save deadline
    const deadlineValue = { day: deadlineDay, hour: deadlineHour, minute: deadlineMinute };
    const { data: existingDeadline } = await supabase
      .from("settings")
      .select("id")
      .eq("key", "report_deadline")
      .single();

    if (existingDeadline) {
      await supabase.from("settings").update({ value: deadlineValue }).eq("id", existingDeadline.id);
    } else {
      await supabase.from("settings").insert({ key: "report_deadline", value: deadlineValue });
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AdminOnly>
      <div>
        <PageHeader title="Settings" description="System configuration and preferences" />

        <div className="bg-card rounded-lg border border-border p-6 max-w-lg space-y-6">
          {/* Week start day */}
          <div>
            <h2 className="text-base font-semibold mb-1">Report Week Start</h2>
            <p className="text-sm text-muted-foreground mb-3">
              The day the weekly report cycle begins. A new checklist starts on this day.
            </p>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Start Day</label>
              <select
                value={weekStartDay}
                onChange={(e) => setWeekStartDay(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
              >
                {DAY_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <h2 className="text-base font-semibold mb-1">Report Deadline</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Cutoff after which teachers can no longer submit or edit reports for that week.
            </p>
            <div className="grid grid-cols-3 gap-3">
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
          </div>

          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </div>
    </AdminOnly>
  );
}
