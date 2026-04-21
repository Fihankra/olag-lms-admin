import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "../../hooks/use-auth";
import { AlertTriangle, CheckCircle2, XCircle, MinusCircle, Plus, Pencil, Clock } from "lucide-react";
import { submitReport as submitReportFn, updateReport as updateReportFn, getDeadlineSetting } from "../../utils/reports.functions";

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
type DeviceOption = { id: string; device_id: string };

function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().split("T")[0];
}

function ReportsPage() {
  const { role, teacherRecord } = useAuth();
  const isTeacher = role === "teacher";
  const assignedClassId = teacherRecord?.assigned_class_id;

  const [reports, setReports] = useState<Report[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [filterClass, setFilterClass] = useState("");
  const [filterWeek, setFilterWeek] = useState(getMonday(new Date()));

  // Teacher report creation / editing
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [classDevices, setClassDevices] = useState<DeviceOption[]>([]);
  const [createForm, setCreateForm] = useState({
    device_id: "",
    kiosk_status: "true",
    device_condition: "good",
    missing_status: "false",
    lms_status: "active",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deadline, setDeadline] = useState<{ day: number; hour: number; minute: number } | null>(null);
  const [deadlineError, setDeadlineError] = useState<string | null>(null);

  async function fetchReports() {
    let query = supabase
      .from("reports")
      .select("*, teachers(name), classes(name), devices(device_id)")
      .eq("week_start", filterWeek)
      .order("created_at", { ascending: false });

    if (isTeacher && assignedClassId) {
      query = query.eq("class_id", assignedClassId);
    } else if (filterClass) {
      query = query.eq("class_id", filterClass);
    }

    const { data } = await query;
    setReports((data as Report[]) ?? []);
  }

  async function fetchClasses() {
    const { data } = await supabase.from("classes").select("id, name");
    setClasses(data ?? []);
  }

  async function fetchClassDevices() {
    if (!assignedClassId) return;
    // Get students in assigned class, then their devices
    const { data: students } = await supabase
      .from("students")
      .select("assigned_device_id")
      .eq("class_id", assignedClassId)
      .not("assigned_device_id", "is", null);

    if (!students?.length) { setClassDevices([]); return; }

    const deviceIds = students.map((s) => s.assigned_device_id).filter(Boolean) as string[];
    if (!deviceIds.length) { setClassDevices([]); return; }

    const { data: devices } = await supabase
      .from("devices")
      .select("id, device_id")
      .in("id", deviceIds);

    setClassDevices((devices as DeviceOption[]) ?? []);
  }

  useEffect(() => { fetchClasses(); }, []);
  useEffect(() => { fetchReports(); }, [filterClass, filterWeek, assignedClassId]);
  useEffect(() => { if (isTeacher) fetchClassDevices(); }, [assignedClassId]);

  // Fetch deadline setting
  useEffect(() => {
    async function loadDeadline() {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return;
        const result = await getDeadlineSetting({
          headers: { authorization: `Bearer ${token}` },
        });
        setDeadline(result);
      } catch {
        // use defaults
        setDeadline({ day: 5, hour: 23, minute: 59 });
      }
    }
    if (isTeacher) loadDeadline();
  }, [isTeacher]);

  // Calculate if past deadline for current viewed week
  const pastDeadline = useMemo(() => {
    if (!deadline) return false;
    const monday = new Date(filterWeek + "T00:00:00Z");
    const deadlineDate = new Date(monday);
    deadlineDate.setUTCDate(monday.getUTCDate() + (deadline.day - 1));
    deadlineDate.setUTCHours(deadline.hour, deadline.minute, 59, 999);
    return new Date() > deadlineDate;
  }, [deadline, filterWeek]);

  // Devices that already have a report this week
  const reportedDeviceIds = useMemo(
    () => new Set(reports.map((r) => r.device_id)),
    [reports],
  );

  const availableDevices = useMemo(
    () => classDevices.filter((d) => !reportedDeviceIds.has(d.id)),
    [classDevices, reportedDeviceIds],
  );

  async function getAuthHeaders() {
    const session = await supabase.auth.getSession();
    return { authorization: `Bearer ${session.data.session?.access_token}` };
  }

  async function createReport() {
    if (!createForm.device_id || !teacherRecord || !assignedClassId) return;
    setSubmitting(true);
    setDeadlineError(null);

    try {
      const headers = await getAuthHeaders();
      const result = await submitReportFn({
        headers,
        data: {
          device_id: createForm.device_id,
          week_start: filterWeek,
          kiosk_status: createForm.kiosk_status === "true",
          device_condition: createForm.device_condition,
          missing_status: createForm.missing_status === "true",
          lms_status: createForm.lms_status,
        },
      });

      if (result.error) {
        setDeadlineError(result.error);
        setSubmitting(false);
        return;
      }
    } catch {
      setDeadlineError("Failed to submit report.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setShowCreateModal(false);
    setEditingReport(null);
    setDeadlineError(null);
    setCreateForm({ device_id: "", kiosk_status: "true", device_condition: "good", missing_status: "false", lms_status: "active" });
    fetchReports();
  }

  function openEditModal(report: Report) {
    setEditingReport(report);
    setDeadlineError(null);
    setCreateForm({
      device_id: report.device_id,
      kiosk_status: report.kiosk_status === true ? "true" : "false",
      device_condition: report.device_condition ?? "good",
      missing_status: report.missing_status === true ? "true" : "false",
      lms_status: report.lms_status ?? "active",
    });
    setShowCreateModal(true);
  }

  async function updateReport() {
    if (!editingReport) return;
    setSubmitting(true);
    setDeadlineError(null);

    try {
      const headers = await getAuthHeaders();
      const result = await updateReportFn({
        headers,
        data: {
          report_id: editingReport.id,
          week_start: filterWeek,
          kiosk_status: createForm.kiosk_status === "true",
          device_condition: createForm.device_condition,
          missing_status: createForm.missing_status === "true",
          lms_status: createForm.lms_status,
        },
      });

      if (result.error) {
        setDeadlineError(result.error);
        setSubmitting(false);
        return;
      }
    } catch {
      setDeadlineError("Failed to update report.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setShowCreateModal(false);
    setEditingReport(null);
    setDeadlineError(null);
    setCreateForm({ device_id: "", kiosk_status: "true", device_condition: "good", missing_status: "false", lms_status: "active" });
    fetchReports();
  }

  // Teachers can only edit reports for the current week AND before deadline
  const currentMonday = getMonday(new Date());
  const canEditReports = isTeacher && filterWeek === currentMonday && !pastDeadline;

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

  const assignedClassName = isTeacher && assignedClassId
    ? classes.find((c) => c.id === assignedClassId)?.name ?? "Your Class"
    : null;

  // If teacher without assigned class, deny access
  if (isTeacher && !assignedClassId) {
    return (
      <div>
        <PageHeader title="Reports" description="You are not assigned as a form master for any class." />
        <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center">
          <MinusCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No Class Assigned</h2>
          <p className="text-sm text-muted-foreground">Contact the admin to be assigned as a form master.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isTeacher ? `Reports — ${assignedClassName}` : "Weekly Reports"}
        description={isTeacher ? "Submit and view weekly device reports for your class" : "Form master device reports by class and week"}
        actions={
          isTeacher && !pastDeadline ? (
            <button
              onClick={() => { setDeadlineError(null); setShowCreateModal(true); }}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> New Report
            </button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {!isTeacher && (
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm border border-border"
          >
            <option value="">All Classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <div className="flex items-center gap-1">
          <button onClick={() => shiftWeek(-1)} className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">←</button>
          <span className="px-3 py-2 text-sm font-medium text-foreground min-w-[200px] text-center">{formatWeek(filterWeek)}</span>
          <button onClick={() => shiftWeek(1)} className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">→</button>
        </div>
      </div>

      {/* Past deadline banner */}
      {isTeacher && pastDeadline && filterWeek === currentMonday && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg border border-destructive/30 bg-destructive/10 text-sm text-destructive">
          <Clock className="h-4 w-4 shrink-0" />
          The deadline for this week's reports has passed. Submissions are closed.
        </div>
      )}

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
          <p className="text-sm text-muted-foreground">
            {isTeacher ? 'Click "New Report" to submit a device report.' : "Try selecting a different week or class."}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Device</th>
                {!isTeacher && <th className="px-4 py-3 font-medium text-muted-foreground">Class</th>}
                {!isTeacher && <th className="px-4 py-3 font-medium text-muted-foreground">Teacher</th>}
                <th className="px-4 py-3 font-medium text-muted-foreground">Kiosk</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Condition</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Missing</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">LMS</th>
                {canEditReports && <th className="px-4 py-3 font-medium text-muted-foreground w-10"></th>}
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
                    {!isTeacher && <td className="px-4 py-3 text-foreground">{r.classes?.name ?? "—"}</td>}
                    {!isTeacher && <td className="px-4 py-3 text-foreground">{r.teachers?.name ?? "—"}</td>}
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
                    {canEditReports && (
                      <td className="px-4 py-3">
                        <button onClick={() => openEditModal(r)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Edit report">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Report Modal (Teacher only) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-1">{editingReport ? "Edit Device Report" : "New Device Report"}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Week of {formatWeek(filterWeek)}
              {editingReport && ` · ${editingReport.devices?.device_id ?? ""}`}
            </p>
            <div className="space-y-3">
              {!editingReport && (
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Device</label>
                  <select
                    value={createForm.device_id}
                    onChange={(e) => setCreateForm({ ...createForm, device_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                  >
                    <option value="">Select device</option>
                    {availableDevices.length === 0 && <option disabled>All devices reported this week</option>}
                    {availableDevices.map((d) => <option key={d.id} value={d.id}>{d.device_id}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Kiosk Mode</label>
                <select value={createForm.kiosk_status} onChange={(e) => setCreateForm({ ...createForm, kiosk_status: e.target.value })} className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm">
                  <option value="true">On</option>
                  <option value="false">Off</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Device Condition</label>
                <select value={createForm.device_condition} onChange={(e) => setCreateForm({ ...createForm, device_condition: e.target.value })} className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm">
                  <option value="good">Good</option>
                  <option value="faulty">Faulty</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Missing?</label>
                <select value={createForm.missing_status} onChange={(e) => setCreateForm({ ...createForm, missing_status: e.target.value })} className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm">
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">LMS Status</label>
                <select value={createForm.lms_status} onChange={(e) => setCreateForm({ ...createForm, lms_status: e.target.value })} className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => { setShowCreateModal(false); setEditingReport(null); setCreateForm({ device_id: "", kiosk_status: "true", device_condition: "good", missing_status: "false", lms_status: "active" }); }} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">Cancel</button>
              <button
                onClick={editingReport ? updateReport : createReport}
                disabled={(!editingReport && !createForm.device_id) || submitting}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? "Saving…" : editingReport ? "Update Report" : "Submit Report"}
              </button>
            </div>
          </div>
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
