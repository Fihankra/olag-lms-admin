import { useState, useRef } from "react";
import { Download, Upload, X, FileSpreadsheet, Loader2 } from "lucide-react";
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
    headers: ["student_id", "name", "program_name", "class_name"],
    sampleData: [["S001", "John Doe", "General Arts", "1 Arts 1"], ["S002", "Jane Smith", "General Science", "1 Science 1"]],
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

  // Set column widths
  ws["!cols"] = config.headers.map(() => ({ wch: 20 }));

  XLSX.utils.book_append_sheet(wb, ws, config.sheetName);
  XLSX.writeFile(wb, `${entity}_template.xlsx`);
}

interface ImportResult {
  success: number;
  errors: string[];
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
      const { error } = await supabase.from("students").insert({
        student_id: row.student_id.trim(),
        name: row.name.trim(),
        program_id: programMap.get(row.program_name?.trim().toLowerCase() ?? "") ?? null,
        class_id: classMap.get(row.class_name?.trim().toLowerCase() ?? "") ?? null,
      });
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

interface ExcelImportProps {
  entity: EntityType;
  onImportComplete: () => void;
}

export function ExcelImport({ entity, onImportComplete }: ExcelImportProps) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

      if (rows.length === 0) {
        setResult({ success: 0, errors: ["File is empty or has no data rows"] });
        return;
      }

      const importResult = await processImport(entity, rows);
      setResult(importResult);
      if (importResult.success > 0) onImportComplete();
    } catch (err: any) {
      setResult({ success: 0, errors: [err?.message || "Failed to read file"] });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => downloadTemplate(entity)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
        title="Download Excel template"
      >
        <Download className="h-4 w-4" />
        Template
      </button>

      <label
        className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
          importing ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground hover:bg-accent/80"
        }`}
        title="Import from Excel"
      >
        {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Import
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          disabled={importing}
          className="hidden"
        />
      </label>

      {result && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Import Results</h2>
              </div>
              <button onClick={() => setResult(null)} className="text-muted-foreground hover:text-foreground">
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
