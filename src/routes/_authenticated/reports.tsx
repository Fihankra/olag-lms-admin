import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "../../hooks/use-auth";
import { AlertTriangle, CheckCircle2, XCircle, MinusCircle, Clock, Save, Loader2, History } from "lucide-react";
import { submitBatchReport, getDeadlineSetting } from "../../utils/reports.functions";

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
  fault_description: string | null;
  missing_status: boolean | null;
  missing_accessories: string[] | null;
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
  fault_description: string | null;
  missing_status: boolean | null;
  missing_accessories: string[] | null;
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

type ChecklistRow = {
  kiosk_status: string;
  device_condition: string;
  fault_description: string;
  missing_status: string;
  missing_accessories: string[];
  lms_status: string;
};

const ACCESSORY_OPTIONS = ["Charger", "Mouse", "Keyboard", "Cover", "Other"] as const;
const FAULT_OPTIONS = ["Cracked Screen", "Battery Issue", "Not Powering On", "Speaker/Mic Issue", "Charging Port Damaged", "Software Issue", "Other"] as const;

function getWeekStart(d: Date, startDay: number): string {
  const date = new Date(d);
  const jsDay = date.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  let diff = isoDay - startDay;
  if (diff < 0) diff += 7;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split("T")[0];
}

const DEFAULT_ROW: ChecklistRow = {
  kiosk_status: "true",
  device_condition: "good",
  fault_description: "",
  missing_status: "false",
  missing_accessories: [],
  lms_status: "active",
};

function ReportsPage() {
  const { role, teacherRecord } = useAuth();
  const isTeacher = role === "teacher";
  const assignedClassId = teacherRecord?.assigned_class_id;

  const [reports, setReports] = useState<Report[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [filterClass, setFilterClass] = useState("");
  const [weekStartDay, setWeekStartDay] = useState(2);
  const [filterWeek, setFilterWeek] = useState("");

  const [studentDevices, setStudentDevices] = useState<StudentDevice[]>([]);
  const [checklist, setChecklist] = useState<Record<string, ChecklistRow>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [deadline, setDeadline] = useState<{ day: number; hour: number; minute: number } | null>(null);

  const [historyReportId, setHistoryReportId] = useState<string | null>(null);
  const [historyDeviceLabel, setHistoryDeviceLabel] = useState("");
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  const fetchReports = useCallback(async () => {
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
  }, [filterWeek, isTeacher, assignedClassId, filterClass]);

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
  useEffect(() => { if (filterWeek) fetchReports(); }, [filterWeek, filterClass, assignedClassId, fetchReports]);
  useEffect(() => { if (isTeacher) fetchStudentDevices(); }, [assignedClassId]);

  useEffect(() => {
    if (!isTeacher || studentDevices.length === 0) return;
    const reportMap = new Map<string, Report>();
    for (const r of reports) reportMap.set(r.device_id, r);

    const newChecklist: Record<string, ChecklistRow> = {};
    for (const sd of studentDevices) {
      const r = reportMap.get(sd.deviceUuid);
      if (r) {
        newChecklist[sd.deviceUuid] = {
          kiosk_status: r.kiosk_status === true ? "true" : "false",
          device_condition: r.device_condition ?? "good",
          fault_description: r.fault_description ?? "",
          missing_status: r.missing_status === true ? "true" : "false",
          missing_accessories: (r.missing_accessories as string[]) ?? [],
          lms_status: r.lms_status ?? "active",
        };
      } else {
        newChecklist[sd.deviceUuid] = { ...DEFAULT_ROW };
      }
    }
    setChecklist(newChecklist);
  }, [isTeacher, studentDevices, reports]);

  useEffect(() => {
    if (!filterWeek) return;
    const channel = supabase
      .channel(`reports-${filterWeek}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reports", filter: `week_start=eq.${filterWeek}` }, () => fetchReports())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filterWeek, filterClass, assignedClassId, fetchReports]);

  const reportByDevice = useMemo(() => {
    const map = new Map<string, Report>();
    for (const r of reports) map.set(r.device_id, r);
    return map;
  }, [reports]);

  function updateRow(deviceUuid: string, field: keyof ChecklistRow, value: string | string[]) {
    setChecklist((prev) => ({
      ...prev,
      [deviceUuid]: { ...(prev[deviceUuid] ?? { ...DEFAULT_ROW }), [field]: value },
    }));
  }

  function toggleAccessory(deviceUuid: string, accessory: string) {
    setChecklist((prev) => {
      const row = prev[deviceUuid] ?? { ...DEFAULT_ROW };
      const current = row.missing_accessories ?? [];
      const next = current.includes(accessory)
        ? current.filter((a) => a !== accessory)
        : [...current, accessory];
      return { ...prev, [deviceUuid]: { ...row, missing_accessories: next } };
    });
  }

  async function submitAll() {
    if (!teacherRecord || !assignedClassId) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const entries = studentDevices.map((sd) => {
      const row = checklist[sd.deviceUuid] ?? DEFAULT_ROW;
      return {
        device_id: sd.deviceUuid,
        kiosk_status: row.kiosk_status === "true",
        device_condition: row.device_condition,
        fault_description: row.device_condition === "faulty" ? (row.fault_description || null) : null,
        missing_status: row.missing_status === "true",
        missing_accessories: row.missing_accessories ?? [],
        lms_status: row.lms_status,
      };
    });

    try {
      const session = await supabase.auth.getSession();
      const result = await submitBatchReport({
        headers: { authorization: `Bearer ${session.data.session?.access_token}` },
        data: { week_start: filterWeek, entries },
      });

      if (result.error) {
        setErrorMsg(result.error);
      } else {
        const parts: string[] = [];
        if (result.inserted) parts.push(`${result.inserted} new`);
        if (result.updated) parts.push(`${result.updated} updated`);
        setSuccessMsg(parts.length ? `Report submitted: ${parts.join(", ")}.` : "No changes to submit.");
        fetchReports();
      }
    } catch {
      setErrorMsg("Failed to submit report.");
    }

    setSubmitting(false);
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

  function shiftWeek(delta: number) {
    if (!filterWeek) return;
    const d = new Date(filterWeek);
    d.setDate(d.getDate() + delta * 7);
    setFilterWeek(d.toISOString().split("T")[0]);
    setSuccessMsg(null);
    setErrorMsg(null);
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
        <div className="bg-card rounded-lg border border-border p-8 sm:p-12 flex flex-col items-center justify-center text-center">
          <MinusCircle className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
          <h2 className="text-base sm:text-lg font-semibold mb-2">No Class Assigned</h2>
          <p className="text-sm text-muted-foreground">Contact the admin to be assigned as a form master.</p>
        </div>
      </div>
    );
  }

  if (!filterWeek) return null;

  const weekNav = (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
      <div className="flex items-center gap-1">
        <button onClick={() => shiftWeek(-1)} className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">←</button>
        <span className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-foreground min-w-0 text-center">{formatWeek(filterWeek)}</span>
        <button onClick={() => shiftWeek(1)} className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">→</button>
      </div>
    </div>
  );

  if (isTeacher) {
    const submittedCount = studentDevices.filter((sd) => reportByDevice.has(sd.deviceUuid)).length;
    const totalCount = studentDevices.length;

    return (
      <div>
        <PageHeader
          title={`Reports — ${assignedClassName}`}
          description={`${submittedCount}/${totalCount} devices reported this week`}
        />

        {weekNav}

        {pastDeadline && filterWeek === currentWeekStart && (
          <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 mb-4 rounded-lg border border-destructive/30 bg-destructive/10 text-xs sm:text-sm text-destructive">
            <Clock className="h-4 w-4 shrink-0" />
            <span>The deadline for this week's reports has passed.</span>
          </div>
        )}

        {reports.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
            <SummaryCard label="Faulty Devices" count={issues.faulty} total={issues.total} variant={issues.faulty > 0 ? "danger" : "ok"} />
            <SummaryCard label="Missing Devices" count={issues.missing} total={issues.total} variant={issues.missing > 0 ? "danger" : "ok"} />
            <SummaryCard label="Kiosk Off" count={issues.kioskOff} total={issues.total} variant={issues.kioskOff > 0 ? "warn" : "ok"} />
            <SummaryCard label="LMS Inactive" count={issues.lmsInactive} total={issues.total} variant={issues.lmsInactive > 0 ? "warn" : "ok"} />
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 mb-4 rounded-lg border border-destructive/30 bg-destructive/10 text-xs sm:text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs sm:text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {successMsg}
          </div>
        )}

        {studentDevices.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-8 sm:p-12 flex flex-col items-center justify-center text-center">
            <MinusCircle className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
            <h2 className="text-base sm:text-lg font-semibold mb-2">No students with devices</h2>
            <p className="text-sm text-muted-foreground">No students in your class have assigned devices.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 sm:hidden">
              {studentDevices.map((sd) => {
                const report = reportByDevice.get(sd.deviceUuid);
                const hasReport = !!report;
                const row = checklist[sd.deviceUuid] ?? DEFAULT_ROW;
                const isFaulty = row.device_condition === "faulty";
                const isMissing = row.missing_status === "true";
                const hasIssue = isFaulty || isMissing;

                return (
                  <div key={sd.deviceUuid} className={`bg-card rounded-lg border p-3 ${hasIssue ? "border-destructive/40 bg-destructive/5" : "border-border"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {hasReport ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                          <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 block shrink-0" />
                        )}
                        <span className="text-sm font-medium text-foreground truncate">{sd.studentName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">{sd.deviceLabel}</span>
                        {hasReport && (
                          <button
                            onClick={() => openHistory(report.id, sd.deviceLabel)}
                            className="p-1 rounded hover:bg-accent text-muted-foreground"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {canEdit ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">Kiosk</span>
                            <select value={row.kiosk_status} onChange={(e) => updateRow(sd.deviceUuid, "kiosk_status", e.target.value)} className="w-full px-2 py-1.5 rounded bg-input border border-border text-foreground text-xs">
                              <option value="true">On</option>
                              <option value="false">Off</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">Condition</span>
                            <select value={row.device_condition} onChange={(e) => updateRow(sd.deviceUuid, "device_condition", e.target.value)} className="w-full px-2 py-1.5 rounded bg-input border border-border text-foreground text-xs">
                              <option value="good">Good</option>
                              <option value="faulty">Faulty</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">Missing</span>
                            <select value={row.missing_status} onChange={(e) => updateRow(sd.deviceUuid, "missing_status", e.target.value)} className="w-full px-2 py-1.5 rounded bg-input border border-border text-foreground text-xs">
                              <option value="false">No</option>
                              <option value="true">Yes</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">LMS</span>
                            <select value={row.lms_status} onChange={(e) => updateRow(sd.deviceUuid, "lms_status", e.target.value)} className="w-full px-2 py-1.5 rounded bg-input border border-border text-foreground text-xs">
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </label>
                        </div>
                        {isFaulty && (
                          <div className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">Fault Type</span>
                            <select value={row.fault_description} onChange={(e) => updateRow(sd.deviceUuid, "fault_description", e.target.value)} className="w-full px-2 py-1.5 rounded bg-input border border-border text-foreground text-xs">
                              <option value="">Select fault…</option>
                              {FAULT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                        )}
                        {isMissing && (
                          <div className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">Missing Accessories</span>
                            <div className="flex flex-wrap gap-1.5">
                              {ACCESSORY_OPTIONS.map((acc) => (
                                <button key={acc} type="button" onClick={() => toggleAccessory(sd.deviceUuid, acc)}
                                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${row.missing_accessories.includes(acc) ? "bg-destructive/20 text-destructive border border-destructive/30" : "bg-muted text-muted-foreground border border-border"}`}
                                >{acc}</button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Kiosk</span>
                            {!hasReport ? <span className="text-muted-foreground">—</span> : report.kiosk_status === false ? (
                              <span className="text-amber-400">Off</span>
                            ) : (
                              <span className="text-emerald-400">On</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Condition</span>
                            {!hasReport ? <span className="text-muted-foreground">—</span> : report.device_condition === "faulty" ? (
                              <span className="text-destructive font-medium">Faulty</span>
                            ) : (
                              <span className="text-emerald-400">Good</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Missing</span>
                            {!hasReport ? <span className="text-muted-foreground">—</span> : report.missing_status ? (
                              <span className="text-destructive font-medium">Yes</span>
                            ) : (
                              <span className="text-emerald-400">No</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">LMS</span>
                            {!hasReport ? <span className="text-muted-foreground">—</span> : report.lms_status === "inactive" ? (
                              <span className="text-amber-400">Inactive</span>
                            ) : (
                              <span className="text-emerald-400">Active</span>
                            )}
                          </div>
                        </div>
                        {hasReport && report.device_condition === "faulty" && report.fault_description && (
                          <p className="text-[11px] text-destructive">Fault: {report.fault_description}</p>
                        )}
                        {hasReport && report.missing_status && (report.missing_accessories as string[])?.length > 0 && (
                          <p className="text-[11px] text-destructive">Missing: {(report.missing_accessories as string[]).join(", ")}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="hidden sm:block bg-card rounded-lg border border-border overflow-x-auto">
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
                    <th className="px-4 py-3 font-medium text-muted-foreground w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {studentDevices.map((sd) => {
                    const report = reportByDevice.get(sd.deviceUuid);
                    const hasReport = !!report;
                    const row = checklist[sd.deviceUuid] ?? DEFAULT_ROW;
                    const isFaulty = row.device_condition === "faulty";
                    const isMissing = row.missing_status === "true";
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
                        {canEdit ? (
                          <>
                            <td className="px-4 py-2">
                              <select value={row.kiosk_status} onChange={(e) => updateRow(sd.deviceUuid, "kiosk_status", e.target.value)} className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs">
                                <option value="true">On</option>
                                <option value="false">Off</option>
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              <div className="space-y-1">
                                <select value={row.device_condition} onChange={(e) => updateRow(sd.deviceUuid, "device_condition", e.target.value)} className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs">
                                  <option value="good">Good</option>
                                  <option value="faulty">Faulty</option>
                                </select>
                                {isFaulty && (
                                  <select value={row.fault_description} onChange={(e) => updateRow(sd.deviceUuid, "fault_description", e.target.value)} className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs">
                                    <option value="">Select fault…</option>
                                    {FAULT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                                  </select>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="space-y-1">
                                <select value={row.missing_status} onChange={(e) => updateRow(sd.deviceUuid, "missing_status", e.target.value)} className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs">
                                  <option value="false">No</option>
                                  <option value="true">Yes</option>
                                </select>
                                {isMissing && (
                                  <div className="flex flex-wrap gap-1">
                                    {ACCESSORY_OPTIONS.map((acc) => (
                                      <button key={acc} type="button" onClick={() => toggleAccessory(sd.deviceUuid, acc)}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${row.missing_accessories.includes(acc) ? "bg-destructive/20 text-destructive border border-destructive/30" : "bg-muted text-muted-foreground border border-border"}`}
                                      >{acc}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <select value={row.lms_status} onChange={(e) => updateRow(sd.deviceUuid, "lms_status", e.target.value)} className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3">
                              {!hasReport ? <span className="text-muted-foreground">—</span> : report.kiosk_status === false ? (
                                <span className="inline-flex items-center gap-1 text-amber-400"><XCircle className="h-3.5 w-3.5" /> Off</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> On</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {!hasReport ? <span className="text-muted-foreground">—</span> : report.device_condition === "faulty" ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 text-destructive font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Faulty</span>
                                  {report.fault_description && <p className="text-[11px] text-muted-foreground mt-0.5">{report.fault_description}</p>}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Good</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {!hasReport ? <span className="text-muted-foreground">—</span> : report.missing_status ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 text-destructive font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Yes</span>
                                  {(report.missing_accessories as string[])?.length > 0 && (
                                    <p className="text-[11px] text-muted-foreground mt-0.5">{(report.missing_accessories as string[]).join(", ")}</p>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> No</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {!hasReport ? <span className="text-muted-foreground">—</span> : report.lms_status === "inactive" ? (
                                <span className="inline-flex items-center gap-1 text-amber-400"><XCircle className="h-3.5 w-3.5" /> Inactive</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span>
                              )}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3">
                          {hasReport && (
                            <button
                              onClick={() => openHistory(report.id, sd.deviceLabel)}
                              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                              title="View history"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canEdit && (
              <div className="flex justify-end mt-4">
                <button
                  onClick={submitAll}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors w-full sm:w-auto justify-center"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Submit All Reports
                </button>
              </div>
            )}
          </>
        )}

        <HistoryModal
          reportId={historyReportId}
          deviceLabel={historyDeviceLabel}
          entries={historyEntries}
          loading={historyLoading}
          onClose={() => { setHistoryReportId(null); setHistoryEntries([]); }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Weekly Reports"
        description="Form master device reports by class and week"
      />

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-xs sm:text-sm border border-border w-full sm:w-auto"
        >
          <option value="">All Classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="flex items-center gap-1">
          <button onClick={() => shiftWeek(-1)} className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">←</button>
          <span className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-foreground min-w-0 text-center">{formatWeek(filterWeek)}</span>
          <button onClick={() => shiftWeek(1)} className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">→</button>
        </div>
      </div>

      {reports.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
          <SummaryCard label="Faulty Devices" count={issues.faulty} total={issues.total} variant={issues.faulty > 0 ? "danger" : "ok"} />
          <SummaryCard label="Missing Devices" count={issues.missing} total={issues.total} variant={issues.missing > 0 ? "danger" : "ok"} />
          <SummaryCard label="Kiosk Off" count={issues.kioskOff} total={issues.total} variant={issues.kioskOff > 0 ? "warn" : "ok"} />
          <SummaryCard label="LMS Inactive" count={issues.lmsInactive} total={issues.total} variant={issues.lmsInactive > 0 ? "warn" : "ok"} />
        </div>
      )}

      {reports.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 sm:p-12 flex flex-col items-center justify-center text-center">
          <MinusCircle className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
          <h2 className="text-base sm:text-lg font-semibold mb-2">No reports for this week</h2>
          <p className="text-sm text-muted-foreground">Try selecting a different week or class.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {reports.map((r) => {
              const isFaulty = r.device_condition === "faulty";
              const isMissing = r.missing_status === true;
              const hasIssue = isFaulty || isMissing;
              return (
                <div key={r.id} className={`bg-card rounded-lg border p-3 ${hasIssue ? "border-destructive/40 bg-destructive/5" : "border-border"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.devices?.device_id ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{r.classes?.name ?? "—"} · {r.teachers?.name ?? "—"}</p>
                    </div>
                    <button
                      onClick={() => openHistory(r.id, r.devices?.device_id ?? "Unknown")}
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground shrink-0"
                    >
                      <History className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Kiosk</span>
                        {r.kiosk_status == null ? <span className="text-muted-foreground">—</span> : r.kiosk_status === false ? (
                          <span className="text-amber-400">Off</span>
                        ) : (
                          <span className="text-emerald-400">On</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Condition</span>
                        {isFaulty ? (
                          <span className="text-destructive font-medium">Faulty</span>
                        ) : (
                          <span className="text-emerald-400">Good</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Missing</span>
                        {isMissing ? (
                          <span className="text-destructive font-medium">Yes</span>
                        ) : (
                          <span className="text-emerald-400">No</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">LMS</span>
                        {r.lms_status === "inactive" ? (
                          <span className="text-amber-400">Inactive</span>
                        ) : (
                          <span className="text-emerald-400">Active</span>
                        )}
                      </div>
                    </div>
                    {isFaulty && r.fault_description && (
                      <p className="text-[11px] text-destructive">Fault: {r.fault_description}</p>
                    )}
                    {isMissing && (r.missing_accessories as string[])?.length > 0 && (
                      <p className="text-[11px] text-destructive">Missing: {(r.missing_accessories as string[]).join(", ")}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden sm:block bg-card rounded-lg border border-border overflow-x-auto">
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
                  <th className="px-4 py-3 font-medium text-muted-foreground w-10"></th>
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
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openHistory(r.id, r.devices?.device_id ?? "Unknown")}
                          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="View history"
                        >
                          <History className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <HistoryModal
        reportId={historyReportId}
        deviceLabel={historyDeviceLabel}
        entries={historyEntries}
        loading={historyLoading}
        onClose={() => { setHistoryReportId(null); setHistoryEntries([]); }}
      />
    </div>
  );
}

function HistoryModal({ reportId, deviceLabel, entries, loading, onClose }: {
  reportId: string | null;
  deviceLabel: string;
  entries: HistoryEntry[];
  loading: boolean;
  onClose: () => void;
}) {
  if (!reportId) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <h2 className="text-base sm:text-lg font-semibold mb-1">Report History</h2>
        <p className="text-xs sm:text-sm text-muted-foreground mb-4">Device: {deviceLabel}</p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No previous versions. This report has not been edited.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, idx) => (
              <div key={entry.id} className="bg-secondary/50 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Version {entries.length - idx}</span>
                  <span className="text-[11px] sm:text-xs text-muted-foreground">{new Date(entry.changed_at).toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Kiosk: </span>
                    <span className={entry.kiosk_status === false ? "text-amber-400" : "text-emerald-400"}>
                      {entry.kiosk_status === false ? "Off" : "On"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Condition: </span>
                    <span className={entry.device_condition === "faulty" ? "text-destructive" : "text-emerald-400"}>
                      {entry.device_condition === "faulty" ? "Faulty" : "Good"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Missing: </span>
                    <span className={entry.missing_status ? "text-destructive" : "text-emerald-400"}>
                      {entry.missing_status ? "Yes" : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">LMS: </span>
                    <span className={entry.lms_status === "inactive" ? "text-amber-400" : "text-emerald-400"}>
                      {entry.lms_status === "inactive" ? "Inactive" : "Active"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, count, total, variant }: { label: string; count: number; total: number; variant: "ok" | "warn" | "danger" }) {
  const colors = { ok: "text-emerald-400", warn: "text-amber-400", danger: "text-destructive" };
  return (
    <div className="bg-card rounded-lg border border-border p-3 sm:p-4">
      <p className="text-[11px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold ${colors[variant]}`}>{count}</p>
      <p className="text-[11px] sm:text-xs text-muted-foreground">of {total} reports</p>
    </div>
  );
}
