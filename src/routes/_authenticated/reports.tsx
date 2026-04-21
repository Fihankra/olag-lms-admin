import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { AlertTriangle, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "Weekly Reports — OLAG LMS" },
      { name: "description", content: "View weekly form master reports per class" },
    ],
  }),
});

type Report = {
  id: string;
  teacher_id: string;
  class_id: string;
  device_id: string;
  week_start: string;
  kiosk_status: boolean | null;
  device_condition: string | null;
  missing_status: boolean | null;
  lms_status: string | null;
  created_at: string;
  teachers?: { name: string } | null;
  classes?: { name: string } | null;
  devices?: { device_id: string } | null;
};

type ClassItem = { id: string; name: string };

function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().split("T")[0];
}

function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [filterClass, setFilterClass] = useState("");
  const [filterWeek, setFilterWeek] = useState(getMonday(new Date()));

  async function fetchReports() {
    let query = supabase
      .from("reports")
      .select("*, teachers(name), classes(name), devices(device_id)")
      .eq("week_start", filterWeek)
      .order("created_at", { ascending: false });

    if (filterClass) query = query.eq("class_id", filterClass);

    const { data } = await query;
    setReports((data as Report[]) ?? []);
  }

  async function fetchClasses() {
    const { data } = await supabase.from("classes").select("id, name");
    setClasses(data ?? []);
  }

  useEffect(() => { fetchClasses(); }, []);
  useEffect(() => { fetchReports(); }, [filterClass, filterWeek]);

  // Issue counts
  const issues = useMemo(() => {
    let faulty = 0, missing = 0, kioskOff = 0, lmsInactive = 0;
    for (const r of reports) {
      if (r.device_condition === "faulty") faulty++;
      if (r.missing_status) missing++;
      if (r.kiosk_status === false) kioskOff++;
      if (r.lms_status === "inactive") lmsInactive++;
    }
    return { faulty, missing, kioskOff, lmsInactive, total: reports.length };
  }, [reports]);

  // Week navigation
  function shiftWeek(delta: number) {
    const d = new Date(filterWeek);
    d.setDate(d.getDate() + delta * 7);
    setFilterWeek(d.toISOString().split("T")[0]);
  }

  function formatWeek(dateStr: string) {
    const d = new Date(dateStr);
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} — ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }

  return (
    <div>
      <PageHeader title="Weekly Reports" description="Form master device reports by class and week" />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm border border-border"
        >
          <option value="">All Classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="flex items-center gap-1">
          <button onClick={() => shiftWeek(-1)} className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">←</button>
          <span className="px-3 py-2 text-sm font-medium text-foreground min-w-[200px] text-center">{formatWeek(filterWeek)}</span>
          <button onClick={() => shiftWeek(1)} className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">→</button>
        </div>
      </div>

      {/* Issue summary cards */}
      {reports.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SummaryCard label="Faulty Devices" count={issues.faulty} total={issues.total} variant={issues.faulty > 0 ? "danger" : "ok"} />
          <SummaryCard label="Missing Devices" count={issues.missing} total={issues.total} variant={issues.missing > 0 ? "danger" : "ok"} />
          <SummaryCard label="Kiosk Off" count={issues.kioskOff} total={issues.total} variant={issues.kioskOff > 0 ? "warn" : "ok"} />
          <SummaryCard label="LMS Inactive" count={issues.lmsInactive} total={issues.total} variant={issues.lmsInactive > 0 ? "warn" : "ok"} />
        </div>
      )}

      {/* Reports table */}
      {reports.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center">
          <MinusCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No reports for this week</h2>
          <p className="text-sm text-muted-foreground">Try selecting a different week or class.</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Device</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Class</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Teacher</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Kiosk</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Condition</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Missing</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">LMS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reports.map((r) => {
                const isFaulty = r.device_condition === "faulty";
                const isMissing = r.missing_status === true;
                const kioskOff = r.kiosk_status === false;
                const lmsInactive = r.lms_status === "inactive";
                const hasIssue = isFaulty || isMissing;

                return (
                  <tr key={r.id} className={hasIssue ? "bg-destructive/5" : ""}>
                    <td className="px-4 py-3 font-medium text-foreground">{r.devices?.device_id ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground">{r.classes?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground">{r.teachers?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      {r.kiosk_status == null ? <span className="text-muted-foreground">—</span> : kioskOff ? (
                        <span className="inline-flex items-center gap-1 text-amber-400"><XCircle className="h-3.5 w-3.5" /> Off</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> On</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!r.device_condition ? <span className="text-muted-foreground">—</span> : isFaulty ? (
                        <span className="inline-flex items-center gap-1 text-destructive font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Faulty</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Good</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.missing_status == null ? <span className="text-muted-foreground">—</span> : isMissing ? (
                        <span className="inline-flex items-center gap-1 text-destructive font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Yes</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!r.lms_status ? <span className="text-muted-foreground">—</span> : lmsInactive ? (
                        <span className="inline-flex items-center gap-1 text-amber-400"><XCircle className="h-3.5 w-3.5" /> Inactive</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, count, total, variant }: { label: string; count: number; total: number; variant: "ok" | "warn" | "danger" }) {
  const colors = {
    ok: "text-emerald-400",
    warn: "text-amber-400",
    danger: "text-destructive",
  };

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[variant]}`}>{count}</p>
      <p className="text-xs text-muted-foreground">of {total} reports</p>
    </div>
  );
}
