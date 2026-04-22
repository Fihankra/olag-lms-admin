import { useState, useRef } from "react";
import { Download, Upload, X, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "../integrations/supabase/client";

type EntityType = "programs" | "classes" | "students" | "devices" | "teachers";

interface TemplateConfig {
  headers: string[];
  sampleData: string[][];
  sheetName: string;
}

const TEMPLATES: Record<EntityType, TemplateConfig> = {
  programs: {
    headers: ["name", "description"],
    sampleData: [["General Arts", "Arts program"], ["General Science", "Science program"]],
    sheetName: "Programs",
  },
  classes: {
    headers: ["name", "program_name"],
    sampleData: [["1 Arts 1", "General Arts"], ["1 Science 1", "General Science"]],
    sheetName: "Classes",
  },
  students: {
    headers: ["student_id", "name", "program_name", "class_name", "gender", "form"],
    sampleData: [["S001", "John Doe", "General Arts", "1 Arts 1", "Male", "Form 1"], ["S002", "Jane Smith", "General Science", "1 Science 1", "Female", "Form 2"]],
    sheetName: "Students",
  },
  devices: {
    headers: ["device_id"],
    sampleData: [["TAB-001"], ["TAB-002"]],
    sheetName: "Devices",
  },
  teachers: {
    headers: ["teacher_id", "name"],
    sampleData: [["T001", "Mr. Smith"], ["T002", "Mrs. Johnson"]],
    sheetName: "Teachers",
  },
};

function downloadTemplate(entity: EntityType) {
  const config = TEMPLATES[entity];
  const wb = XLSX.utils.book_new();
  const data = [config.headers, ...config.sampleData];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = config.headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, config.sheetName);
  XLSX.writeFile(wb, `${entity}_template.xlsx`);
}

interface ImportResult {
  success: number;
  errors: string[];
}

interface PreviewRow {
  rowNum: number;
  fields: Record<string, { value: string; resolvedId?: string; resolvedLabel?: string; status: "ok" | "warn" | "error" }>;
}

const UNIQUE_KEYS: Partial<Record<EntityType, string[]>> = {
  students: ["student_id"],
  devices: ["device_id"],
  teachers: ["teacher_id"],
  programs: ["name"],
  classes: ["name"],
};

async function buildPreview(entity: EntityType, rows: Record<string, string>[]): Promise<PreviewRow[]> {
  let programMap = new Map<string, { id: string; name: string }>();
  let classMap = new Map<string, { id: string; name: string }>();

  if (["classes", "students"].includes(entity)) {
    const { data: programs } = await supabase.from("programs").select("id, name");
    programMap = new Map((programs ?? []).map((p) => [p.name.toLowerCase(), { id: p.id, name: p.name }]));
  }
  if (entity === "students") {
    const { data: classes } = await supabase.from("classes").select("id, name, program_id");
    classMap = new Map((classes ?? []).map((c) => [c.name.toLowerCase(), { id: c.id, name: c.name, programId: (c as any).program_id as string }]));
  }

  const duplicates = new Map<string, Set<number>>();
  const uniqueKeys = UNIQUE_KEYS[entity] ?? [];
  for (const key of uniqueKeys) {
    const seen = new Map<string, number[]>();
    rows.forEach((row, i) => {
      const val = row[key]?.trim().toLowerCase();
      if (!val) return;
      if (!seen.has(val)) seen.set(val, []);
      seen.get(val)!.push(i);
    });
    for (const [, indices] of seen) {
      if (indices.length > 1) {
        for (const idx of indices) {
          duplicates.set(`${key}:${idx}`, new Set(indices));
        }
      }
    }
  }

  const isDuplicate = (key: string, rowIdx: number) => duplicates.has(`${key}:${rowIdx}`);

  return rows.map((row, i) => {
    const fields: PreviewRow["fields"] = {};

    if (entity === "programs") {
      const nameStatus = !row.name?.trim() ? "error" : isDuplicate("name", i) ? "warn" : "ok";
      fields.name = { value: row.name || "", status: nameStatus, ...(isDuplicate("name", i) && row.name?.trim() ? { resolvedLabel: "⚠ Duplicate name in file" } : {}) };
      fields.description = { value: row.description || "", status: "ok" };
    }

    if (entity === "classes") {
      const nameStatus = !row.name?.trim() ? "error" : isDuplicate("name", i) ? "warn" : "ok";
      fields.name = { value: row.name || "", status: nameStatus, ...(isDuplicate("name", i) && row.name?.trim() ? { resolvedLabel: "⚠ Duplicate name in file" } : {}) };
      const key = row.program_name?.trim().toLowerCase() ?? "";
      const match = programMap.get(key);
      fields.program_name = {
        value: row.program_name || "",
        resolvedId: match?.id,
        resolvedLabel: match ? `→ ${match.name} (${match.id.slice(0, 8)}…)` : undefined,
        status: match ? "ok" : key ? "error" : "error",
      };
    }

    if (entity === "students") {
      const sidStatus = !row.student_id?.trim() ? "error" : isDuplicate("student_id", i) ? "warn" : "ok";
      fields.student_id = { value: row.student_id || "", status: sidStatus, ...(isDuplicate("student_id", i) && row.student_id?.trim() ? { resolvedLabel: "⚠ Duplicate student_id in file" } : {}) };
      fields.name = { value: row.name || "", status: row.name?.trim() ? "ok" : "error" };
      const pKey = row.program_name?.trim().toLowerCase() ?? "";
      const pMatch = programMap.get(pKey);
      fields.program_name = {
        value: row.program_name || "",
        resolvedId: pMatch?.id,
        resolvedLabel: pMatch ? `→ ${pMatch.name} (${pMatch.id.slice(0, 8)}…)` : undefined,
        status: pMatch ? "ok" : pKey ? "error" : "warn",
      };
      const cKey = row.class_name?.trim().toLowerCase() ?? "";
      const cMatch = classMap.get(cKey);
      fields.class_name = {
        value: row.class_name || "",
        resolvedId: cMatch?.id,
        resolvedLabel: cMatch ? `→ ${cMatch.name} (${cMatch.id.slice(0, 8)}…)` : undefined,
        status: cMatch ? "ok" : cKey ? "error" : "warn",
      };
      const validGenders = ["male", "female"];
      const gVal = row.gender?.trim().toLowerCase() ?? "";
      fields.gender = { value: row.gender || "", status: gVal ? (validGenders.includes(gVal) ? "ok" : "error") : "warn" };
      const validForms = ["form 1", "form 2", "form 3"];
      const fVal = row.form?.trim().toLowerCase() ?? "";
      fields.form = { value: row.form || "", status: fVal ? (validForms.includes(fVal) ? "ok" : "error") : "warn" };
    }

    if (entity === "devices") {
      const didStatus = !row.device_id?.trim() ? "error" : isDuplicate("device_id", i) ? "warn" : "ok";
      fields.device_id = { value: row.device_id || "", status: didStatus, ...(isDuplicate("device_id", i) && row.device_id?.trim() ? { resolvedLabel: "⚠ Duplicate device_id in file" } : {}) };
    }

    if (entity === "teachers") {
      const tidStatus = !row.teacher_id?.trim() ? "error" : isDuplicate("teacher_id", i) ? "warn" : "ok";
      fields.teacher_id = { value: row.teacher_id || "", status: tidStatus, ...(isDuplicate("teacher_id", i) && row.teacher_id?.trim() ? { resolvedLabel: "⚠ Duplicate teacher_id in file" } : {}) };
      fields.name = { value: row.name || "", status: row.name?.trim() ? "ok" : "error" };
    }

    return { rowNum: i + 2, fields };
  });
}

async function processImport(entity: EntityType, rows: Record<string, string>[]): Promise<ImportResult> {
  const result: ImportResult = { success: 0, errors: [] };

  if (entity === "programs") {
    for (const row of rows) {
      if (!row.name?.trim()) { result.errors.push("Missing name"); continue; }
      const { error } = await supabase.from("programs").insert({ name: row.name.trim(), description: row.description?.trim() || null });
      if (error) result.errors.push(`"${row.name}": ${error.message}`);
      else result.success++;
    }
  }

  if (entity === "classes") {
    const { data: programs } = await supabase.from("programs").select("id, name");
    const programMap = new Map((programs ?? []).map((p) => [p.name.toLowerCase(), p.id]));
    for (const row of rows) {
      if (!row.name?.trim()) { result.errors.push("Missing name"); continue; }
      const programId = programMap.get(row.program_name?.trim().toLowerCase() ?? "");
      if (!programId) { result.errors.push(`"${row.name}": program "${row.program_name}" not found`); continue; }
      const { error } = await supabase.from("classes").insert({ name: row.name.trim(), program_id: programId });
      if (error) result.errors.push(`"${row.name}": ${error.message}`);
      else result.success++;
    }
  }

  if (entity === "students") {
    const [{ data: programs }, { data: classes }] = await Promise.all([
      supabase.from("programs").select("id, name"),
      supabase.from("classes").select("id, name"),
    ]);
    const programMap = new Map((programs ?? []).map((p) => [p.name.toLowerCase(), p.id]));
    const classMap = new Map((classes ?? []).map((c) => [c.name.toLowerCase(), c.id]));
    for (const row of rows) {
      if (!row.student_id?.trim() || !row.name?.trim()) { result.errors.push("Missing student_id or name"); continue; }
      const genderVal = row.gender?.trim();
      const formVal = row.form?.trim();
      const validGender = genderVal && ["Male", "Female"].includes(genderVal) ? genderVal : null;
      const validForm = formVal && ["Form 1", "Form 2", "Form 3"].includes(formVal) ? formVal : null;
      const { error } = await supabase.from("students").insert({
        student_id: row.student_id.trim(),
        name: row.name.trim(),
        program_id: programMap.get(row.program_name?.trim().toLowerCase() ?? "") ?? null,
        class_id: classMap.get(row.class_name?.trim().toLowerCase() ?? "") ?? null,
        gender: validGender,
        form: validForm,
      } as any);
      if (error) result.errors.push(`"${row.student_id}": ${error.message}`);
      else result.success++;
    }
  }

  if (entity === "devices") {
    for (const row of rows) {
      if (!row.device_id?.trim()) { result.errors.push("Missing device_id"); continue; }
      const { error } = await supabase.from("devices").insert({ device_id: row.device_id.trim() });
      if (error) result.errors.push(`"${row.device_id}": ${error.message}`);
      else result.success++;
    }
  }

  if (entity === "teachers") {
    for (const row of rows) {
      if (!row.teacher_id?.trim() || !row.name?.trim()) { result.errors.push("Missing teacher_id or name"); continue; }
      const { error } = await supabase.from("teachers").insert({ teacher_id: row.teacher_id.trim(), name: row.name.trim(), approved: true });
      if (error) result.errors.push(`"${row.teacher_id}": ${error.message}`);
      else result.success++;
    }
  }

  return result;
}

const ENTITY_LABELS: Record<EntityType, string> = {
  programs: "Programs",
  classes: "Classes",
  students: "Students",
  devices: "Devices",
  teachers: "Teachers",
};

const DELETE_ORDER: Record<EntityType, EntityType[]> = {
  programs: ["students", "classes", "programs"],
  classes: ["students", "classes"],
  students: ["students"],
  devices: ["devices"],
  teachers: ["teachers"],
};

async function clearEntity(entity: EntityType): Promise<string[]> {
  const errors: string[] = [];
  const toDelete = DELETE_ORDER[entity];
  for (const table of toDelete) {
    const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) errors.push(`Failed to clear ${table}: ${error.message}`);
  }
  return errors;
}

interface ExcelImportProps {
  entity: EntityType;
  onImportComplete: () => void;
}

export function ExcelImport({ entity, onImportComplete }: ExcelImportProps) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resetFileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, isReset: boolean) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResult(null);
    setPreview(null);
    setResetMode(isReset);
    setConfirmReset(false);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

      if (rows.length === 0) {
        setResult({ success: 0, errors: ["File is empty or has no data rows"] });
        setLoading(false);
        return;
      }

      setRawRows(rows);
      const previewData = await buildPreview(entity, rows);
      setPreview(previewData);
    } catch (err: any) {
      setResult({ success: 0, errors: [err?.message || "Failed to read file"] });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (resetFileRef.current) resetFileRef.current.value = "";
    }
  }

  async function confirmImport() {
    setImporting(true);
    const allErrors: string[] = [];

    if (resetMode) {
      const clearErrors = await clearEntity(entity);
      allErrors.push(...clearErrors);
      if (clearErrors.length > 0) {
        setResult({ success: 0, errors: clearErrors });
        setPreview(null);
        setRawRows([]);
        setImporting(false);
        return;
      }
    }

    const importResult = await processImport(entity, rawRows);
    importResult.errors = [...allErrors, ...importResult.errors];
    setResult(importResult);
    setPreview(null);
    setRawRows([]);
    setImporting(false);
    if (importResult.success > 0) onImportComplete();
  }

  function cancelPreview() {
    setPreview(null);
    setRawRows([]);
    setResetMode(false);
    setConfirmReset(false);
  }

  const hasErrors = preview?.some((r) => Object.values(r.fields).some((f) => f.status === "error")) ?? false;
  const errorCount = preview?.reduce((sum, r) => sum + Object.values(r.fields).filter((f) => f.status === "error").length, 0) ?? 0;
  const warnCount = preview?.reduce((sum, r) => sum + Object.values(r.fields).filter((f) => f.status === "warn" && f.resolvedLabel?.startsWith("⚠")).length, 0) ?? 0;

  const statusIcon = (status: "ok" | "warn" | "error") => {
    if (status === "ok") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    if (status === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
    return <X className="h-3.5 w-3.5 text-destructive shrink-0" />;
  };

  const fieldHeaders = preview && preview.length > 0 ? Object.keys(preview[0].fields) : [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Icon-only on mobile, icon+text on sm+ */}
      <button
        onClick={() => downloadTemplate(entity)}
        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
        title="Download Excel template"
      >
        <Download className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Template</span>
      </button>

      <label
        className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
          loading ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground hover:bg-accent/80"
        }`}
        title="Import from Excel (append)"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 shrink-0" />}
        <span className="hidden sm:inline">Import</span>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => handleFile(e, false)}
          disabled={loading}
          className="hidden"
        />
      </label>

      <label
        className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
          loading ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive hover:bg-destructive/20"
        }`}
        title="Clear all existing records and reimport from file"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 shrink-0" />}
        <span className="hidden sm:inline">Reset & Import</span>
        <input
          ref={resetFileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => handleFile(e, true)}
          disabled={loading}
          className="hidden"
        />
      </label>

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-card rounded-t-lg sm:rounded-lg border border-border p-4 sm:p-6 w-full sm:max-w-3xl sm:mx-4 max-h-[90vh] sm:max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
                <h2 className="text-base sm:text-lg font-semibold truncate">Import Preview</h2>
                <span className="text-xs text-muted-foreground shrink-0">({preview.length})</span>
              </div>
              <button onClick={cancelPreview} className="text-muted-foreground hover:text-foreground p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            {resetMode && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Trash2 className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-sm font-medium text-destructive">Reset & Recreate Mode</p>
                </div>
                <p className="text-xs text-destructive/80 mb-2">
                  All existing {ENTITY_LABELS[entity].toLowerCase()} records{DELETE_ORDER[entity].length > 1 ? ` (and dependent ${DELETE_ORDER[entity].slice(0, -1).join(", ")})` : ""} will be permanently deleted before importing.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmReset}
                    onChange={(e) => setConfirmReset(e.target.checked)}
                    className="rounded border-destructive"
                  />
                  <span className="text-xs text-destructive">I understand this will delete all existing data</span>
                </label>
              </div>
            )}

            {warnCount > 0 && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm text-amber-400 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {warnCount} duplicate key{warnCount !== 1 ? "s" : ""} found — these rows may cause conflicts during import.
              </div>
            )}

            {hasErrors && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive mb-3">
                {errorCount} mapping error{errorCount !== 1 ? "s" : ""} found — rows with errors will fail on import.
              </div>
            )}

            <div className="overflow-auto flex-1 border border-border rounded-md">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 sticky top-0">
                    <th className="px-2 sm:px-3 py-2 text-left text-xs font-medium text-muted-foreground">Row</th>
                    {fieldHeaders.map((h) => (
                      <th key={h} className="px-2 sm:px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.map((row) => (
                    <tr key={row.rowNum} className="hover:bg-muted/30">
                      <td className="px-2 sm:px-3 py-2 text-xs text-muted-foreground">{row.rowNum}</td>
                      {fieldHeaders.map((h) => {
                        const f = row.fields[h];
                        return (
                          <td key={h} className="px-2 sm:px-3 py-2">
                            <div className="flex items-start gap-1.5">
                              {statusIcon(f.status)}
                              <div className="min-w-0">
                                <span className="text-xs text-foreground">{f.value || <span className="text-muted-foreground italic">empty</span>}</span>
                                {f.resolvedLabel && (
                                  <p className={`text-[11px] mt-0.5 ${f.status === "ok" ? "text-emerald-400" : f.status === "warn" ? "text-amber-400" : "text-destructive"}`}>
                                    {f.resolvedLabel}
                                  </p>
                                )}
                                {!f.resolvedLabel && f.status === "error" && f.value && (
                                  <p className="text-[11px] mt-0.5 text-destructive">Not found in database</p>
                                )}
                                {!f.resolvedLabel && f.status === "error" && !f.value && (
                                  <p className="text-[11px] mt-0.5 text-destructive">Required field</p>
                                )}
                                {f.status === "warn" && !f.resolvedLabel && !f.value && (
                                  <p className="text-[11px] mt-0.5 text-amber-400">Optional — will be empty</p>
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-3 sm:mt-4 gap-3">
              <p className="text-xs text-muted-foreground">
                {hasErrors
                  ? "Fix errors in your spreadsheet and re-upload, or proceed with partial import."
                  : "All rows validated — ready to import."}
              </p>
              <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={cancelPreview} className="flex-1 sm:flex-initial px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">
                  Cancel
                </button>
                <button
                  onClick={confirmImport}
                  disabled={importing || (resetMode && !confirmReset)}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-md disabled:opacity-50 ${
                    resetMode
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : resetMode ? <RefreshCw className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                  {importing ? "Processing…" : resetMode ? `Reset & Import ${preview.length}` : `Import ${preview.length}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results Modal */}
      {result && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-card rounded-t-lg sm:rounded-lg border border-border p-4 sm:p-6 w-full sm:max-w-md sm:mx-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <h2 className="text-base sm:text-lg font-semibold">Import Results</h2>
              </div>
              <button onClick={() => setResult(null)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            {result.success > 0 && (
              <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 mb-3">
                ✓ {result.success} record{result.success !== 1 ? "s" : ""} imported successfully
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">{result.errors.length} error{result.errors.length !== 1 ? "s" : ""}:</p>
                <div className="max-h-40 overflow-y-auto rounded-md bg-destructive/10 px-3 py-2">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive">{err}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button onClick={() => setResult(null)} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
