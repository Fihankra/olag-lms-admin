import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../../hooks/use-auth";
import { AlertTriangle, CheckCircle2, XCircle, MinusCircle, Pencil, Clock, Save, Loader2, History } from "lucide-react";
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

type HistoryEntry = {
  id: string;
  kiosk_status: boolean | null;
  device_condition: string | null;
  missing_status: boolean | null;
  lms_status: string | null;
  changed_at: string;
};

type ClassItem = { id: string; name: string };
type StudentDevice = {
  studentId: string;
  studentName: string;
  studentCode: string;
  deviceUuid: string;
  deviceLabel: string;
};

/**
 * Get the most recent occurrence of `targetDay` (1=Mon..7=Sun) on or before `d`.
 */
function getWeekStart(d: Date, startDay: number): string {
  const date = new Date(d);
  // JS getDay: 0=Sun,1=Mon..6=Sat  →  convert to 1=Mon..7=Sun
  const jsDay = date.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  let diff = isoDay - startDay;
  if (diff < 0) diff += 7;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split("T")[0];
}

function ReportsPage() {
  const { role, teacherRecord } = useAuth();
  const isTeacher = role === "teacher";
  const assignedClassId = teacherRecord?.assigned_class_id;

  const [reports, setReports] = useState<Report[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [filterClass, setFilterClass] = useState("");
  const [weekStartDay, setWeekStartDay] = useState(2); // default Tuesday
  const [filterWeek, setFilterWeek] = useState("");

  // Checklist data (teacher)
  const [studentDevices, setStudentDevices] = useState<StudentDevice[]>([]);

  // Inline editing state (teacher)
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    kiosk_status: "true",
    device_condition: "good",
    missing_status: "false",
    lms_status: "active",
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Deadline
  const [deadline, setDeadline] = useState<{ day: number; hour: number; minute: number } | null>(null);

  // History modal
  const [historyReportId, setHistoryReportId] = useState<string | null>(null);
  const [historyDeviceLabel, setHistoryDeviceLabel] = useState("");
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load settings first, then set filterWeek
  useEffect(() => {
    async function init() {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) {
          setFilterWeek(getWeekStart(new Date(), 2));
          return;
        }
        const result = await getDeadlineSetting({
          headers: { authorization: `Bearer ${token}` },
        });
        setWeekStartDay(result.weekStartDay);
        setDeadline({ day: result.day, hour: result.hour, minute: result.minute });
        setFilterWeek(getWeekStart(new Date(), result.weekStartDay));
      } catch {
        setDeadline({ day: 2, hour: 23, minute: 59 });
        setFilterWeek(getWeekStart(new Date(), 2));
      }
    }
    init();
  }, []);

  const pastDeadline = useMemo(() => {
    if (!deadline || !filterWeek) return false;
    const startDate = new Date(filterWeek + "T00:00:00Z");
    let dayOffset = deadline.day - weekStartDay;
    if (dayOffset < 0) dayOffset += 7;
    const deadlineDate = new Date(startDate);
    deadlineDate.setUTCDate(startDate.getUTCDate() + dayOffset);
    deadlineDate.setUTCHours(deadline.hour, deadline.minute, 59, 999);
    return new Date() > deadlineDate;
  }, [deadline, filterWeek, weekStartDay]);

  const currentWeekStart = useMemo(() => getWeekStart(new Date(), weekStartDay), [weekStartDay]);
  const canEdit = isTeacher && filterWeek === currentWeekStart && !pastDeadline;

  async function fetchReports() {
    if (!filterWeek) return;
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

  async function fetchStudentDevices() {
    if (!assignedClassId) return;
    const { data: students } = await supabase
      .from("students")
      .select("id, name, student_id, assigned_device_id")
      .eq("class_id", assignedClassId)
      .not("assigned_device_id", "is", null)
      .order("name");

    if (!students?.length) { setStudentDevices([]); return; }

    const deviceIds = students.map((s) => s.assigned_device_id).filter(Boolean) as string[];
    if (!deviceIds.length) { setStudentDevices([]); return; }

    const { data: devices } = await supabase
      .from("devices")
      .select("id, device_id")
      .in("id", deviceIds);

    const devMap = new Map((devices ?? []).map((d: any) => [d.id, d.device_id]));

    setStudentDevices(
      students.map((s) => ({
        studentId: s.id,
        studentName: s.name,
        studentCode: s.student_id,
        deviceUuid: s.assigned_device_id!,
        deviceLabel: devMap.get(s.assigned_device_id!) ?? s.assigned_device_id!,
      }))
    );
  }

  useEffect(() => { fetchClasses(); }, []);
  useEffect(() => { if (filterWeek) fetchReports(); }, [filterClass, filterWeek, assignedClassId]);
  useEffect(() => { if (isTeacher) fetchStudentDevices(); }, [assignedClassId]);

  // Realtime
  useEffect(() => {
    if (!filterWeek) return;
    const channel = supabase
      .channel(`reports-${filterWeek}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reports", filter: `week_start=eq.${filterWeek}` }, () => fetchReports())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filterWeek, filterClass, assignedClassId]);

  // Map device_id -> report
  const reportByDevice = useMemo(() => {
    const map = new Map<string, Report>();
    for (const r of reports) map.set(r.device_id, r);
    return map;
  }, [reports]);

  async function getAuthHeaders() {
    const session = await supabase.auth.getSession();
    return { authorization: `Bearer ${session.data.session?.access_token}` };
  }

  async function openHistory(reportId: string, deviceLabel: string) {
    setHistoryReportId(reportId);
    setHistoryDeviceLabel(deviceLabel);
    setHistoryLoading(true);
    const { data } = await supabase
      .from("report_history")
      .select("id, kiosk_status, device_condition, missing_status, lms_status, changed_at")
      .eq("report_id", reportId)
      .order("changed_at", { ascending: false });
    setHistoryEntries((data as HistoryEntry[]) ?? []);
    setHistoryLoading(false);
  }

  function startReportForDevice(deviceUuid: string) {
    const existing = reportByDevice.get(deviceUuid);
    if (existing) {
      setEditForm({
        kiosk_status: existing.kiosk_status === true ? "true" : "false",
        device_condition: existing.device_condition ?? "good",
        missing_status: existing.missing_status === true ? "true" : "false",
        lms_status: existing.lms_status ?? "active",
      });
    } else {
      setEditForm({ kiosk_status: "true", device_condition: "good", missing_status: "false", lms_status: "active" });
    }
    setEditingDeviceId(deviceUuid);
    setErrorMsg(null);
  }

  async function saveReport() {
    if (!editingDeviceId || !teacherRecord || !assignedClassId) return;
    setSubmitting(true);
    setErrorMsg(null);

    const existing = reportByDevice.get(editingDeviceId);
    const headers = await getAuthHeaders();

    try {
      let result;
      if (existing) {
        result = await updateReportFn({
          headers,
          data: {
            report_id: existing.id,
            week_start: filterWeek,
            kiosk_status: editForm.kiosk_status === "true",
            device_condition: editForm.device_condition,
            missing_status: editForm.missing_status === "true",
            lms_status: editForm.lms_status,
          },
        });
      } else {
        result = await submitReportFn({
          headers,
          data: {
            device_id: editingDeviceId,
            week_start: filterWeek,
            kiosk_status: editForm.kiosk_status === "true",
            device_condition: editForm.device_condition,
            missing_status: editForm.missing_status === "true",
            lms_status: editForm.lms_status,
          },
        });
      }

      if (result.error) {
        setErrorMsg(result.error);
        setSubmitting(false);
        return;
      }
    } catch {
      setErrorMsg("Failed to save report.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setEditingDeviceId(null);
    fetchReports();
  }

  function shiftWeek(delta: number) {
    if (!filterWeek) return;
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

  // Summary stats
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

  if (!filterWeek) return null;

  // --------- TEACHER VIEW: Checklist ---------
  if (isTeacher) {
    const submittedCount = studentDevices.filter((sd) => reportByDevice.has(sd.deviceUuid)).length;
    const totalCount = studentDevices.length;

    return (
      <div>
        <PageHeader
          title={`Reports — ${assignedClassName}`}
          description={`${submittedCount}/${totalCount} devices reported this week`}
        />

        {/* Week nav */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-1">
            <button onClick={() => shiftWeek(-1)} className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">←</button>
            <span className="px-3 py-2 text-sm font-medium text-foreground min-w-[200px] text-center">{formatWeek(filterWeek)}</span>
            <button onClick={() => shiftWeek(1)} className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">→</button>
          </div>
        </div>

        {/* Past deadline banner */}
        {pastDeadline && filterWeek === currentWeekStart && (
          <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg border border-destructive/30 bg-destructive/10 text-sm text-destructive">
            <Clock className="h-4 w-4 shrink-0" />
            The deadline for this week's reports has passed. Submissions are closed.
          </div>
        )}

        {/* Summary cards */}
        {reports.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Faulty Devices" count={issues.faulty} total={issues.total} variant={issues.faulty > 0 ? "danger" : "ok"} />
            <SummaryCard label="Missing Devices" count={issues.missing} total={issues.total} variant={issues.missing > 0 ? "danger" : "ok"} />
            <SummaryCard label="Kiosk Off" count={issues.kioskOff} total={issues.total} variant={issues.kioskOff > 0 ? "warn" : "ok"} />
            <SummaryCard label="LMS Inactive" count={issues.lmsInactive} total={issues.total} variant={issues.lmsInactive > 0 ? "warn" : "ok"} />
          </div>
        )}

        {/* Student/Device Checklist */}
        {studentDevices.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center">
            <MinusCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">No students with devices</h2>
            <p className="text-sm text-muted-foreground">No students in your class have assigned devices.</p>
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Student</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Device</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Kiosk</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Condition</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Missing</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">LMS</th>
                  {canEdit && <th className="px-4 py-3 font-medium text-muted-foreground w-20"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {studentDevices.map((sd) => {
                  const report = reportByDevice.get(sd.deviceUuid);
                  const isEditing = editingDeviceId === sd.deviceUuid;
                  const hasReport = !!report;

                  if (isEditing && canEdit) {
                    return (
                      <tr key={sd.deviceUuid} className="bg-primary/5">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-primary text-xs font-medium">
                            <Pencil className="h-3.5 w-3.5" /> {hasReport ? "Editing" : "New"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{sd.studentName}</td>
                        <td className="px-4 py-3 text-foreground">{sd.deviceLabel}</td>
                        <td className="px-4 py-2">
                          <select value={editForm.kiosk_status} onChange={(e) => setEditForm({ ...editForm, kiosk_status: e.target.value })} className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs">
                            <option value="true">On</option>
                            <option value="false">Off</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select value={editForm.device_condition} onChange={(e) => setEditForm({ ...editForm, device_condition: e.target.value })} className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs">
                            <option value="good">Good</option>
                            <option value="faulty">Faulty</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select value={editForm.missing_status} onChange={(e) => setEditForm({ ...editForm, missing_status: e.target.value })} className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs">
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select value={editForm.lms_status} onChange={(e) => setEditForm({ ...editForm, lms_status: e.target.value })} className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <button onClick={saveReport} disabled={submitting} className="p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50" title="Save">
                              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            </button>
                            <button onClick={() => { setEditingDeviceId(null); setErrorMsg(null); }} className="p-1.5 rounded bg-secondary text-secondary-foreground text-xs">✕</button>
                          </div>
                          {errorMsg && <p className="text-xs text-destructive mt-1 max-w-[120px]">{errorMsg}</p>}
                        </td>
                      </tr>
                    );
                  }

                  // Display row
                  const isFaulty = report?.device_condition === "faulty";
                  const isMissing = report?.missing_status === true;
                  const hasIssue = isFaulty || isMissing;

                  return (
                    <tr key={sd.deviceUuid} className={hasIssue ? "bg-destructive/5" : ""}>
                      <td className="px-4 py-3">
                        {hasReport ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 block" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{sd.studentName}</td>
                      <td className="px-4 py-3 text-foreground">{sd.deviceLabel}</td>
                      {hasReport ? (
                        <>
                          <td className="px-4 py-3">
                            {report.kiosk_status === false ? (
                              <span className="inline-flex items-center gap-1 text-amber-400"><XCircle className="h-3.5 w-3.5" /> Off</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> On</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isFaulty ? (
                              <span className="inline-flex items-center gap-1 text-destructive font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Faulty</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Good</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isMissing ? (
                              <span className="inline-flex items-center gap-1 text-destructive font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Yes</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> No</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {report.lms_status === "inactive" ? (
                              <span className="inline-flex items-center gap-1 text-amber-400"><XCircle className="h-3.5 w-3.5" /> Inactive</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-muted-foreground">—</td>
                          <td className="px-4 py-3 text-muted-foreground">—</td>
                          <td className="px-4 py-3 text-muted-foreground">—</td>
                          <td className="px-4 py-3 text-muted-foreground">—</td>
                        </>
                      )}
                      {canEdit && (
                        <td className="px-4 py-3">
                          <button
                            onClick={() => startReportForDevice(sd.deviceUuid)}
                            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                            title={hasReport ? "Edit report" : "Submit report"}
                          >
                            {hasReport ? <Pencil className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
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
      </div>
    );
  }

  // --------- ADMIN VIEW ---------
  return (
    <div>
      <PageHeader
        title="Weekly Reports"
        description="Form master device reports by class and week"
      />

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

      {/* Summary cards */}
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
                const hasIssue = isFaulty || isMissing;
                return (
                  <tr key={r.id} className={hasIssue ? "bg-destructive/5" : ""}>
                    <td className="px-4 py-3 font-medium text-foreground">{r.devices?.device_id ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground">{r.classes?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground">{r.teachers?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      {r.kiosk_status == null ? <span className="text-muted-foreground">—</span> : r.kiosk_status === false ? (
                        <span className="inline-flex items-center gap-1 text-amber-400"><XCircle className="h-3.5 w-3.5" /> Off</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> On</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isFaulty ? (
                        <span className="inline-flex items-center gap-1 text-destructive font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Faulty</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Good</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isMissing ? (
                        <span className="inline-flex items-center gap-1 text-destructive font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Yes</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.lms_status === "inactive" ? (
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
  const colors = { ok: "text-emerald-400", warn: "text-amber-400", danger: "text-destructive" };
  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[variant]}`}>{count}</p>
      <p className="text-xs text-muted-foreground">of {total} reports</p>
    </div>
  );
}
