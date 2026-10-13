import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "../../hooks/use-auth";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Save,
  Loader2,
  History,
} from "lucide-react";
import { submitBatchReport, localDateString } from "../../utils/reports.functions";
import { ExcelExport } from "../../components/ExcelExport";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type Report = {
  id: string;
  teacher_id: string;
  class_id: string;
  device_id: string;
  report_date: string;
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
const FAULT_OPTIONS = [
  "Cracked Screen",
  "Battery Issue",
  "Not Powering On",
  "Speaker/Mic Issue",
  "Charging Port Damaged",
  "Software Issue",
  "Other",
] as const;

type IssueFilter = "" | "any" | "faulty" | "missing" | "kiosk_off" | "lms_inactive";

const ISSUE_FILTERS: { value: IssueFilter; label: string }[] = [
  { value: "", label: "All reports" },
  { value: "any", label: "Any issue" },
  { value: "faulty", label: "Faulty / damaged" },
  { value: "missing", label: "Missing" },
  { value: "kiosk_off", label: "Kiosk off" },
  { value: "lms_inactive", label: "LMS inactive" },
];

function matchesIssue(r: Report, f: IssueFilter): boolean {
  switch (f) {
    case "":
      return true;
    case "faulty":
      return r.device_condition === "faulty";
    case "missing":
      return r.missing_status === true;
    case "kiosk_off":
      return r.kiosk_status === false;
    case "lms_inactive":
      return r.lms_status === "inactive";
    case "any":
      return (
        r.device_condition === "faulty" ||
        r.missing_status === true ||
        r.kiosk_status === false ||
        r.lms_status === "inactive"
      );
  }
}

/** Shift a YYYY-MM-DD string by whole days (local time) */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return localDateString(d);
}

function formatDate(dateStr: string, withWeekday = false): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: withWeekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type ClassSummary = {
  classId: string;
  className: string;
  reports: number;
  faulty: number;
  missing: number;
  kioskOff: number;
  lmsInactive: number;
  lastDate: string | null;
};

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
  const today = localDateString(new Date());
  // Teacher: the single date being reported. Admin: a date range.
  const [reportDate, setReportDate] = useState(today);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [filterIssue, setFilterIssue] = useState<IssueFilter>("");
  const [adminView, setAdminView] = useState<"devices" | "classes">("devices");

  const [studentDevices, setStudentDevices] = useState<StudentDevice[]>([]);
  const [checklist, setChecklist] = useState<Record<string, ChecklistRow>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [historyReportId, setHistoryReportId] = useState<string | null>(null);
  const [historyDeviceLabel, setHistoryDeviceLabel] = useState("");
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const canEdit = isTeacher && reportDate <= today;
  const rangeFrom = isTeacher ? reportDate : dateFrom <= dateTo ? dateFrom : dateTo;
  const rangeTo = isTeacher ? reportDate : dateFrom <= dateTo ? dateTo : dateFrom;

  const fetchReports = useCallback(async () => {
    // Supabase caps responses at 1000 rows, so page through long date ranges
    const PAGE = 1000;
    const all: Report[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from("reports")
        .select("*, teachers(name), classes(name), devices(device_id)")
        .gte("report_date", rangeFrom)
        .lte("report_date", rangeTo)
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);

      if (isTeacher && assignedClassId) {
        query = query.eq("class_id", assignedClassId);
      } else if (filterClass) {
        query = query.eq("class_id", filterClass);
      }

      const { data, error } = await query;
      if (error) {
        console.error("fetchReports error:", error);
        break;
      }
      all.push(...((data as Report[]) ?? []));
      if (!data || data.length < PAGE) break;
    }
    setReports(all);
  }, [rangeFrom, rangeTo, isTeacher, assignedClassId, filterClass]);

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

    if (!students?.length) {
      setStudentDevices([]);
      return;
    }

    const deviceIds = students.map((s) => s.assigned_device_id).filter(Boolean) as string[];
    if (!deviceIds.length) {
      setStudentDevices([]);
      return;
    }

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
      })),
    );
  }

  useEffect(() => {
    fetchClasses();
  }, []);
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);
  useEffect(() => {
    if (isTeacher) fetchStudentDevices();
  }, [assignedClassId]);

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
    const channel = supabase
      .channel(`reports-${rangeFrom}-${rangeTo}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reports",
          ...(rangeFrom === rangeTo ? { filter: `report_date=eq.${rangeFrom}` } : {}),
        },
        () => fetchReports(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rangeFrom, rangeTo, fetchReports]);

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
        fault_description: row.device_condition === "faulty" ? row.fault_description || null : null,
        missing_status: row.missing_status === "true",
        missing_accessories: row.missing_accessories ?? [],
        lms_status: row.lms_status,
      };
    });

    try {
      const result = await submitBatchReport({ report_date: reportDate, entries });

      if (result.error) {
        setErrorMsg(result.error);
      } else {
        const parts: string[] = [];
        if (result.inserted) parts.push(`${result.inserted} new`);
        if (result.updated) parts.push(`${result.updated} updated`);
        setSuccessMsg(
          parts.length ? `Report submitted: ${parts.join(", ")}.` : "No changes to submit.",
        );
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
      .select(
        "id, kiosk_status, device_condition, fault_description, missing_status, missing_accessories, lms_status, changed_at",
      )
      .eq("report_id", reportId)
      .order("changed_at", { ascending: false });
    setHistoryEntries((data as HistoryEntry[]) ?? []);
    setHistoryLoading(false);
  }

  function changeReportDate(date: string) {
    if (!date) return;
    setReportDate(date > today ? today : date);
    setSuccessMsg(null);
    setErrorMsg(null);
  }

  function setAdminRange(from: string, to: string) {
    setDateFrom(from);
    setDateTo(to);
  }

  const assignedClassName =
    isTeacher && assignedClassId
      ? (classes.find((c) => c.id === assignedClassId)?.name ?? "Your Class")
      : null;

  const issues = useMemo(() => {
    let faulty = 0,
      missing = 0,
      kioskOff = 0,
      lmsInactive = 0;
    for (const r of reports) {
      if (r.device_condition === "faulty") faulty++;
      if (r.missing_status) missing++;
      if (r.kiosk_status === false) kioskOff++;
      if (r.lms_status === "inactive") lmsInactive++;
    }
    return { faulty, missing, kioskOff, lmsInactive, total: reports.length };
  }, [reports]);

  const filteredReports = useMemo(
    () => reports.filter((r) => matchesIssue(r, filterIssue)),
    [reports, filterIssue],
  );

  // Per-class rollup for the admin "By class" view, including classes with no reports
  const classSummaries = useMemo(() => {
    const map = new Map<string, ClassSummary>();
    const visibleClasses = filterClass ? classes.filter((c) => c.id === filterClass) : classes;
    for (const c of visibleClasses) {
      map.set(c.id, {
        classId: c.id,
        className: c.name,
        reports: 0,
        faulty: 0,
        missing: 0,
        kioskOff: 0,
        lmsInactive: 0,
        lastDate: null,
      });
    }
    for (const r of reports) {
      let cs = map.get(r.class_id);
      if (!cs) {
        cs = {
          classId: r.class_id,
          className: r.classes?.name ?? "—",
          reports: 0,
          faulty: 0,
          missing: 0,
          kioskOff: 0,
          lmsInactive: 0,
          lastDate: null,
        };
        map.set(r.class_id, cs);
      }
      cs.reports++;
      if (r.device_condition === "faulty") cs.faulty++;
      if (r.missing_status) cs.missing++;
      if (r.kiosk_status === false) cs.kioskOff++;
      if (r.lms_status === "inactive") cs.lmsInactive++;
      if (!cs.lastDate || r.report_date > cs.lastDate) cs.lastDate = r.report_date;
    }
    const issueCount = (cs: ClassSummary) =>
      filterIssue === "faulty"
        ? cs.faulty
        : filterIssue === "missing"
          ? cs.missing
          : filterIssue === "kiosk_off"
            ? cs.kioskOff
            : filterIssue === "lms_inactive"
              ? cs.lmsInactive
              : cs.faulty + cs.missing + cs.kioskOff + cs.lmsInactive;
    return [...map.values()]
      .filter((cs) => !filterIssue || issueCount(cs) > 0)
      .sort((a, b) => issueCount(b) - issueCount(a) || a.className.localeCompare(b.className));
  }, [reports, classes, filterClass, filterIssue]);

  if (isTeacher && !assignedClassId) {
    return (
      <div>
        <PageHeader
          title="Reports"
          description="You are not assigned as a form master for any class."
        />
        <div className="bg-card rounded-lg border border-border p-8 sm:p-12 flex flex-col items-center justify-center text-center">
          <MinusCircle className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
          <h2 className="text-base sm:text-lg font-semibold mb-2">No Class Assigned</h2>
          <p className="text-sm text-muted-foreground">
            Contact the admin to be assigned as a form master.
          </p>
        </div>
      </div>
    );
  }

  const dateNav = (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
      <div className="flex items-center gap-1">
        <button
          onClick={() => changeReportDate(addDays(reportDate, -1))}
          title="Previous day"
          className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors"
        >
          ←
        </button>
        <input
          type="date"
          value={reportDate}
          max={today}
          onChange={(e) => changeReportDate(e.target.value)}
          aria-label="Report date"
          className="px-2 sm:px-3 py-1.5 rounded-md bg-input border border-border text-foreground text-xs sm:text-sm"
        />
        <button
          onClick={() => changeReportDate(addDays(reportDate, 1))}
          disabled={reportDate >= today}
          title="Next day"
          className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors disabled:opacity-40"
        >
          →
        </button>
      </div>
      {reportDate !== today && (
        <button
          onClick={() => changeReportDate(today)}
          className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
        >
          Today
        </button>
      )}
      <span className="text-xs text-muted-foreground">{formatDate(reportDate, true)}</span>
    </div>
  );

  if (isTeacher) {
    const submittedCount = studentDevices.filter((sd) => reportByDevice.has(sd.deviceUuid)).length;
    const totalCount = studentDevices.length;

    return (
      <div>
        <PageHeader
          title={`Reports — ${assignedClassName}`}
          description={`${submittedCount}/${totalCount} devices reported for ${reportDate === today ? "today" : formatDate(reportDate)}`}
        />

        {dateNav}

        {reports.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
            <SummaryCard
              label="Faulty Devices"
              count={issues.faulty}
              total={issues.total}
              variant={issues.faulty > 0 ? "danger" : "ok"}
            />
            <SummaryCard
              label="Missing Devices"
              count={issues.missing}
              total={issues.total}
              variant={issues.missing > 0 ? "danger" : "ok"}
            />
            <SummaryCard
              label="Kiosk Off"
              count={issues.kioskOff}
              total={issues.total}
              variant={issues.kioskOff > 0 ? "warn" : "ok"}
            />
            <SummaryCard
              label="LMS Inactive"
              count={issues.lmsInactive}
              total={issues.total}
              variant={issues.lmsInactive > 0 ? "warn" : "ok"}
            />
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
            <p className="text-sm text-muted-foreground">
              No students in your class have assigned devices.
            </p>
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
                  <div
                    key={sd.deviceUuid}
                    className={`bg-card rounded-lg border p-3 ${hasIssue ? "border-destructive/40 bg-destructive/5" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {hasReport ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                          <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 block shrink-0" />
                        )}
                        <span className="text-sm font-medium text-foreground truncate">
                          {sd.studentName}
                        </span>
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
                            <select
                              value={row.kiosk_status}
                              onChange={(e) =>
                                updateRow(sd.deviceUuid, "kiosk_status", e.target.value)
                              }
                              className="w-full px-2 py-1.5 rounded bg-input border border-border text-foreground text-xs"
                            >
                              <option value="true">On</option>
                              <option value="false">Off</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">Condition</span>
                            <select
                              value={row.device_condition}
                              onChange={(e) =>
                                updateRow(sd.deviceUuid, "device_condition", e.target.value)
                              }
                              className="w-full px-2 py-1.5 rounded bg-input border border-border text-foreground text-xs"
                            >
                              <option value="good">Good</option>
                              <option value="faulty">Faulty</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">Missing</span>
                            <select
                              value={row.missing_status}
                              onChange={(e) =>
                                updateRow(sd.deviceUuid, "missing_status", e.target.value)
                              }
                              className="w-full px-2 py-1.5 rounded bg-input border border-border text-foreground text-xs"
                            >
                              <option value="false">No</option>
                              <option value="true">Yes</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">LMS</span>
                            <select
                              value={row.lms_status}
                              onChange={(e) =>
                                updateRow(sd.deviceUuid, "lms_status", e.target.value)
                              }
                              className="w-full px-2 py-1.5 rounded bg-input border border-border text-foreground text-xs"
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </label>
                        </div>
                        {isFaulty && (
                          <div className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">Fault Type</span>
                            <select
                              value={row.fault_description}
                              onChange={(e) =>
                                updateRow(sd.deviceUuid, "fault_description", e.target.value)
                              }
                              className="w-full px-2 py-1.5 rounded bg-input border border-border text-foreground text-xs"
                            >
                              <option value="">Select fault…</option>
                              {FAULT_OPTIONS.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {isMissing && (
                          <div className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">
                              Missing Accessories
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {ACCESSORY_OPTIONS.map((acc) => (
                                <button
                                  key={acc}
                                  type="button"
                                  onClick={() => toggleAccessory(sd.deviceUuid, acc)}
                                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${row.missing_accessories.includes(acc) ? "bg-destructive/20 text-destructive border border-destructive/30" : "bg-muted text-muted-foreground border border-border"}`}
                                >
                                  {acc}
                                </button>
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
                            {!hasReport ? (
                              <span className="text-muted-foreground">—</span>
                            ) : report.kiosk_status === false ? (
                              <span className="text-amber-400">Off</span>
                            ) : (
                              <span className="text-emerald-400">On</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Condition</span>
                            {!hasReport ? (
                              <span className="text-muted-foreground">—</span>
                            ) : report.device_condition === "faulty" ? (
                              <span className="text-destructive font-medium">Faulty</span>
                            ) : (
                              <span className="text-emerald-400">Good</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Missing</span>
                            {!hasReport ? (
                              <span className="text-muted-foreground">—</span>
                            ) : report.missing_status ? (
                              <span className="text-destructive font-medium">Yes</span>
                            ) : (
                              <span className="text-emerald-400">No</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">LMS</span>
                            {!hasReport ? (
                              <span className="text-muted-foreground">—</span>
                            ) : report.lms_status === "inactive" ? (
                              <span className="text-amber-400">Inactive</span>
                            ) : (
                              <span className="text-emerald-400">Active</span>
                            )}
                          </div>
                        </div>
                        {hasReport &&
                          report.device_condition === "faulty" &&
                          report.fault_description && (
                            <p className="text-[11px] text-destructive">
                              Fault: {report.fault_description}
                            </p>
                          )}
                        {hasReport &&
                          report.missing_status &&
                          (report.missing_accessories as string[])?.length > 0 && (
                            <p className="text-[11px] text-destructive">
                              Missing: {(report.missing_accessories as string[]).join(", ")}
                            </p>
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
                              <select
                                value={row.kiosk_status}
                                onChange={(e) =>
                                  updateRow(sd.deviceUuid, "kiosk_status", e.target.value)
                                }
                                className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs"
                              >
                                <option value="true">On</option>
                                <option value="false">Off</option>
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              <div className="space-y-1">
                                <select
                                  value={row.device_condition}
                                  onChange={(e) =>
                                    updateRow(sd.deviceUuid, "device_condition", e.target.value)
                                  }
                                  className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs"
                                >
                                  <option value="good">Good</option>
                                  <option value="faulty">Faulty</option>
                                </select>
                                {isFaulty && (
                                  <select
                                    value={row.fault_description}
                                    onChange={(e) =>
                                      updateRow(sd.deviceUuid, "fault_description", e.target.value)
                                    }
                                    className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs"
                                  >
                                    <option value="">Select fault…</option>
                                    {FAULT_OPTIONS.map((f) => (
                                      <option key={f} value={f}>
                                        {f}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="space-y-1">
                                <select
                                  value={row.missing_status}
                                  onChange={(e) =>
                                    updateRow(sd.deviceUuid, "missing_status", e.target.value)
                                  }
                                  className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs"
                                >
                                  <option value="false">No</option>
                                  <option value="true">Yes</option>
                                </select>
                                {isMissing && (
                                  <div className="flex flex-wrap gap-1">
                                    {ACCESSORY_OPTIONS.map((acc) => (
                                      <button
                                        key={acc}
                                        type="button"
                                        onClick={() => toggleAccessory(sd.deviceUuid, acc)}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${row.missing_accessories.includes(acc) ? "bg-destructive/20 text-destructive border border-destructive/30" : "bg-muted text-muted-foreground border border-border"}`}
                                      >
                                        {acc}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <select
                                value={row.lms_status}
                                onChange={(e) =>
                                  updateRow(sd.deviceUuid, "lms_status", e.target.value)
                                }
                                className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-xs"
                              >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3">
                              {!hasReport ? (
                                <span className="text-muted-foreground">—</span>
                              ) : report.kiosk_status === false ? (
                                <span className="inline-flex items-center gap-1 text-amber-400">
                                  <XCircle className="h-3.5 w-3.5" /> Off
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> On
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {!hasReport ? (
                                <span className="text-muted-foreground">—</span>
                              ) : report.device_condition === "faulty" ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 text-destructive font-medium">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Faulty
                                  </span>
                                  {report.fault_description && (
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                      {report.fault_description}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Good
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {!hasReport ? (
                                <span className="text-muted-foreground">—</span>
                              ) : report.missing_status ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 text-destructive font-medium">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Yes
                                  </span>
                                  {(report.missing_accessories as string[])?.length > 0 && (
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                      {(report.missing_accessories as string[]).join(", ")}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> No
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {!hasReport ? (
                                <span className="text-muted-foreground">—</span>
                              ) : report.lms_status === "inactive" ? (
                                <span className="inline-flex items-center gap-1 text-amber-400">
                                  <XCircle className="h-3.5 w-3.5" /> Inactive
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Active
                                </span>
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
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
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
          onClose={() => {
            setHistoryReportId(null);
            setHistoryEntries([]);
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Device Reports"
        description="Form master device reports by date and class"
        actions={
          <ExcelExport
            data={filteredReports.map((r) => ({
              date: r.report_date,
              class: r.classes?.name ?? "",
              teacher: r.teachers?.name ?? "",
              device: r.devices?.device_id ?? "",
              kiosk: r.kiosk_status == null ? "" : r.kiosk_status ? "On" : "Off",
              condition: r.device_condition ?? "",
              fault: r.fault_description ?? "",
              missing: r.missing_status ? "Yes" : "No",
              missing_accessories: (r.missing_accessories ?? []).join(", "),
              lms: r.lms_status ?? "",
            }))}
            filename={`reports_${rangeFrom}_to_${rangeTo}`}
            sheetName="Reports"
          />
        }
      />

      <div className="flex flex-wrap items-end gap-2 sm:gap-3 mb-3">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          From
          <input
            type="date"
            value={dateFrom}
            max={today}
            onChange={(e) => e.target.value && setDateFrom(e.target.value)}
            className="px-3 py-1.5 rounded-md bg-input border border-border text-foreground text-xs sm:text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          To
          <input
            type="date"
            value={dateTo}
            max={today}
            onChange={(e) => e.target.value && setDateTo(e.target.value)}
            className="px-3 py-1.5 rounded-md bg-input border border-border text-foreground text-xs sm:text-sm"
          />
        </label>
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          aria-label="Class"
          className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-xs sm:text-sm border border-border"
        >
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={filterIssue}
          onChange={(e) => setFilterIssue(e.target.value as IssueFilter)}
          aria-label="Issue"
          className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-xs sm:text-sm border border-border"
        >
          {ISSUE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "Today", from: today, to: today },
            { label: "Yesterday", from: addDays(today, -1), to: addDays(today, -1) },
            { label: "Last 7 days", from: addDays(today, -6), to: today },
            { label: "This month", from: today.slice(0, 8) + "01", to: today },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => setAdminRange(p.from, p.to)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                rangeFrom === p.from && rangeTo === p.to
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-border overflow-hidden">
          {(["devices", "classes"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setAdminView(v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                adminView === v
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {v === "devices" ? "By device" : "By class"}
            </button>
          ))}
        </div>
      </div>

      {reports.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
          <SummaryCard
            label="Faulty Devices"
            count={issues.faulty}
            total={issues.total}
            variant={issues.faulty > 0 ? "danger" : "ok"}
          />
          <SummaryCard
            label="Missing Devices"
            count={issues.missing}
            total={issues.total}
            variant={issues.missing > 0 ? "danger" : "ok"}
          />
          <SummaryCard
            label="Kiosk Off"
            count={issues.kioskOff}
            total={issues.total}
            variant={issues.kioskOff > 0 ? "warn" : "ok"}
          />
          <SummaryCard
            label="LMS Inactive"
            count={issues.lmsInactive}
            total={issues.total}
            variant={issues.lmsInactive > 0 ? "warn" : "ok"}
          />
        </div>
      )}

      {adminView === "classes" ? (
        <ClassSummaryTable
          rows={classSummaries}
          onSelect={(classId) => {
            setFilterClass(classId);
            setAdminView("devices");
          }}
        />
      ) : filteredReports.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 sm:p-12 flex flex-col items-center justify-center text-center">
          <MinusCircle className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
          <h2 className="text-base sm:text-lg font-semibold mb-2">
            {reports.length === 0 ? "No reports for these dates" : "No reports match this filter"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Try a different date range, class or issue filter.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {filteredReports.map((r) => {
              const isFaulty = r.device_condition === "faulty";
              const isMissing = r.missing_status === true;
              const hasIssue = isFaulty || isMissing;
              return (
                <div
                  key={r.id}
                  className={`bg-card rounded-lg border p-3 ${hasIssue ? "border-destructive/40 bg-destructive/5" : "border-border"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {r.devices?.device_id ?? "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {formatDate(r.report_date)} · {r.classes?.name ?? "—"} ·{" "}
                        {r.teachers?.name ?? "—"}
                      </p>
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
                        {r.kiosk_status == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : r.kiosk_status === false ? (
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
                      <p className="text-[11px] text-destructive">
                        Missing: {(r.missing_accessories as string[]).join(", ")}
                      </p>
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
                  <th className="px-4 py-3 font-medium text-muted-foreground">Date</th>
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
                {filteredReports.map((r) => {
                  const isFaulty = r.device_condition === "faulty";
                  const isMissing = r.missing_status === true;
                  const hasIssue = isFaulty || isMissing;
                  return (
                    <tr key={r.id} className={hasIssue ? "bg-destructive/5" : ""}>
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">
                        {formatDate(r.report_date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {r.devices?.device_id ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-foreground">{r.classes?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-foreground">{r.teachers?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        {r.kiosk_status == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : r.kiosk_status === false ? (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <XCircle className="h-3.5 w-3.5" /> Off
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> On
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isFaulty ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-destructive font-medium">
                              <AlertTriangle className="h-3.5 w-3.5" /> Faulty
                            </span>
                            {r.fault_description && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {r.fault_description}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Good
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isMissing ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-destructive font-medium">
                              <AlertTriangle className="h-3.5 w-3.5" /> Yes
                            </span>
                            {(r.missing_accessories as string[])?.length > 0 && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {(r.missing_accessories as string[]).join(", ")}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> No
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.lms_status === "inactive" ? (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <XCircle className="h-3.5 w-3.5" /> Inactive
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Active
                          </span>
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
        onClose={() => {
          setHistoryReportId(null);
          setHistoryEntries([]);
        }}
      />
    </div>
  );
}

function HistoryModal({
  reportId,
  deviceLabel,
  entries,
  loading,
  onClose,
}: {
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
          <p className="text-sm text-muted-foreground py-4 text-center">
            No previous versions. This report has not been edited.
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, idx) => (
              <div key={entry.id} className="bg-secondary/50 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Version {entries.length - idx}
                  </span>
                  <span className="text-[11px] sm:text-xs text-muted-foreground">
                    {new Date(entry.changed_at).toLocaleString()}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Kiosk: </span>
                      <span
                        className={
                          entry.kiosk_status === false ? "text-amber-400" : "text-emerald-400"
                        }
                      >
                        {entry.kiosk_status === false ? "Off" : "On"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Condition: </span>
                      <span
                        className={
                          entry.device_condition === "faulty"
                            ? "text-destructive"
                            : "text-emerald-400"
                        }
                      >
                        {entry.device_condition === "faulty" ? "Faulty" : "Good"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Missing: </span>
                      <span
                        className={entry.missing_status ? "text-destructive" : "text-emerald-400"}
                      >
                        {entry.missing_status ? "Yes" : "No"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">LMS: </span>
                      <span
                        className={
                          entry.lms_status === "inactive" ? "text-amber-400" : "text-emerald-400"
                        }
                      >
                        {entry.lms_status === "inactive" ? "Inactive" : "Active"}
                      </span>
                    </div>
                  </div>
                  {entry.device_condition === "faulty" && entry.fault_description && (
                    <p className="text-[11px] text-muted-foreground">
                      Fault: {entry.fault_description}
                    </p>
                  )}
                  {entry.missing_status && (entry.missing_accessories as string[])?.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Missing: {(entry.missing_accessories as string[]).join(", ")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  count,
  total,
  variant,
}: {
  label: string;
  count: number;
  total: number;
  variant: "ok" | "warn" | "danger";
}) {
  const colors = { ok: "text-emerald-400", warn: "text-amber-400", danger: "text-destructive" };
  return (
    <div className="bg-card rounded-lg border border-border p-3 sm:p-4">
      <p className="text-[11px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold ${colors[variant]}`}>{count}</p>
      <p className="text-[11px] sm:text-xs text-muted-foreground">of {total} reports</p>
    </div>
  );
}

function ClassSummaryTable({
  rows,
  onSelect,
}: {
  rows: ClassSummary[];
  onSelect: (classId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-8 sm:p-12 flex flex-col items-center justify-center text-center">
        <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 text-emerald-400 mb-4" />
        <h2 className="text-base sm:text-lg font-semibold mb-2">No classes match</h2>
        <p className="text-sm text-muted-foreground">
          No class has reports with this issue in the selected dates.
        </p>
      </div>
    );
  }
  const cell = (n: number, variant: "danger" | "warn") =>
    n > 0 ? (
      <span className={variant === "danger" ? "text-destructive font-medium" : "text-amber-400"}>
        {n}
      </span>
    ) : (
      <span className="text-muted-foreground">0</span>
    );
  return (
    <div className="bg-card rounded-lg border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-3 font-medium text-muted-foreground">Class</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Reports</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Faulty</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Missing</th>
            <th className="px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
              Kiosk Off
            </th>
            <th className="px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
              LMS Inactive
            </th>
            <th className="px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
              Last Report
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((cs) => {
            const hasIssue = cs.faulty > 0 || cs.missing > 0;
            return (
              <tr
                key={cs.classId}
                onClick={() => onSelect(cs.classId)}
                title="Show this class's device reports"
                className={`cursor-pointer hover:bg-muted/20 ${hasIssue ? "bg-destructive/5" : ""}`}
              >
                <td className="px-4 py-3 font-medium text-foreground">{cs.className}</td>
                <td className="px-4 py-3">
                  {cs.reports > 0 ? (
                    cs.reports
                  ) : (
                    <span className="text-amber-400 text-xs">Not reported</span>
                  )}
                </td>
                <td className="px-4 py-3">{cell(cs.faulty, "danger")}</td>
                <td className="px-4 py-3">{cell(cs.missing, "danger")}</td>
                <td className="px-4 py-3 hidden sm:table-cell">{cell(cs.kioskOff, "warn")}</td>
                <td className="px-4 py-3 hidden sm:table-cell">{cell(cs.lmsInactive, "warn")}</td>
                <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground whitespace-nowrap">
                  {cs.lastDate ? formatDate(cs.lastDate) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
