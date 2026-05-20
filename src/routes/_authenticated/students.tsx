import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { DataTable } from "../../components/DataTable";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";
import { AdminOnly } from "../../components/AdminOnly";
import { ExcelImport } from "../../components/ExcelImport";
import { Pencil, Trash2, Eye, EyeOff, Search } from "lucide-react";
import { toastResult } from "../../lib/supabase-toast";
import { ExcelExport } from "../../components/ExcelExport";


export const Route = createFileRoute("/_authenticated/students")({
  component: StudentsPage,
  head: () => ({
    meta: [
      { title: "Students — OLAG LMS" },
      { name: "description", content: "Manage students and device assignments" },
    ],
  }),
});

type Student = {
  id: string;
  student_id: string;
  name: string;
  password_hash?: string | null;
  program_id: string | null;
  class_id: string | null;
  assigned_device_id: string | null;
  gender?: string | null;
  form?: string | null;
  programs?: { name: string } | null;
  classes?: { name: string } | null;
  devices?: { device_id: string } | null;
};

type Program = { id: string; name: string };
type ClassItem = { id: string; name: string; program_id: string };

type FormState = { student_id: string; name: string; program_id: string; class_id: string; gender: string; form_level: string };
const emptyForm: FormState = { student_id: "", name: "", program_id: "", class_id: "", gender: "", form_level: "" };

function StudentFormModal({
  title,
  form,
  setForm,
  programs,
  classes,
  onSubmit,
  onCancel,
  submitLabel,
  disableStudentId,
}: {
  title: string;
  form: FormState;
  setForm: (f: FormState) => void;
  programs: Program[];
  classes: ClassItem[];
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  disableStudentId?: boolean;
}) {
  const filteredClasses = classes.filter((c) => !form.program_id || c.program_id === form.program_id);
  const mismatch = !!(form.class_id && form.program_id && !filteredClasses.some((c) => c.id === form.class_id));

  // Auto-clear class if it doesn't belong to the selected program
  const handleProgramChange = (programId: string) => {
    const newFiltered = classes.filter((c) => !programId || c.program_id === programId);
    const classStillValid = !form.class_id || newFiltered.some((c) => c.id === form.class_id);
    setForm({ ...form, program_id: programId, class_id: classStillValid ? form.class_id : "" });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        <div className="space-y-3">
          <input
            placeholder="Student ID"
            value={form.student_id}
            onChange={(e) => setForm({ ...form, student_id: e.target.value })}
            disabled={disableStudentId}
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm disabled:opacity-60"
          />
          <input
            placeholder="Full Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
          />
          <select
            value={form.program_id}
            onChange={(e) => handleProgramChange(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
          >
            <option value="">Select Program</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div>
            <select
              value={form.class_id}
              onChange={(e) => setForm({ ...form, class_id: e.target.value })}
              className={`w-full px-3 py-2 rounded-md bg-input border text-foreground text-sm ${mismatch ? "border-destructive" : "border-border"}`}
            >
              <option value="">Select Class</option>
              {filteredClasses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {mismatch && (
              <p className="text-xs text-destructive mt-1">Selected class does not belong to the chosen program.</p>
            )}
          </div>
          <select
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
          >
            <option value="">Select Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          <select
            value={form.form_level}
            onChange={(e) => setForm({ ...form, form_level: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
          >
            <option value="">Select Form</option>
            <option value="Form 1">Form 1</option>
            <option value="Form 2">Form 2</option>
            <option value="Form 3">Form 3</option>
          </select>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">Cancel</button>
          <button onClick={onSubmit} disabled={mismatch} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filterProgram, setFilterProgram] = useState("");
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [filterClass, setFilterClass] = useState("");
  const [search, setSearch] = useState("");
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());
  const [showAllPasswords, setShowAllPasswords] = useState(false);

  function togglePassword(id: string) {
    setRevealedPasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function fetchStudents() {
    const { data, error } = await supabase
      .from("students")
      .select("*, programs(name), classes(name), devices:assigned_device_id(device_id)")
      .order("created_at", { ascending: false });
    if (error) console.error("fetchStudents error:", error);
    setStudents((data as Student[]) ?? []);
  }

  async function fetchMeta() {
    const [pRes, cRes] = await Promise.all([
      supabase.from("programs").select("id, name"),
      supabase.from("classes").select("id, name, program_id"),
    ]);
    setPrograms(pRes.data ?? []);
    setClasses(cRes.data ?? []);
  }

  useEffect(() => {
    fetchStudents();
    fetchMeta();

    const channel = supabase
      .channel("meta-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "programs" }, () => fetchMeta())
      .on("postgres_changes", { event: "*", schema: "public", table: "classes" }, () => fetchMeta())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  function openAdd() {
    setForm(emptyForm);
    setEditingStudent(null);
    setShowAddModal(true);
  }

  function openEdit(s: Student) {
    setForm({
      student_id: s.student_id,
      name: s.name,
      program_id: s.program_id ?? "",
      class_id: s.class_id ?? "",
      gender: (s as any).gender ?? "",
      form_level: (s as any).form ?? "",
    });
    setEditingStudent(s);
  }

  async function addStudent() {
    if (!form.student_id.trim() || !form.name.trim()) return;
    const { error } = await supabase.from("students").insert({
      student_id: form.student_id.trim(),
      name: form.name.trim(),
      program_id: form.program_id || null,
      class_id: form.class_id || null,
      gender: form.gender || null,
      form: form.form_level || null,
    } as any);
    if (!toastResult(error)) return;
    toastResult(null, "Student added successfully");
    setForm(emptyForm);
    setShowAddModal(false);
    fetchStudents();
  }

  async function updateStudent() {
    if (!editingStudent || !form.name.trim()) return;
    const { error } = await supabase.from("students").update({
      name: form.name.trim(),
      program_id: form.program_id || null,
      class_id: form.class_id || null,
      gender: form.gender || null,
      form: form.form_level || null,
    } as any).eq("id", editingStudent.id);
    if (!toastResult(error)) return;
    toastResult(null, "Student updated successfully");
    setEditingStudent(null);
    setForm(emptyForm);
    fetchStudents();
  }

  async function deleteStudent(id: string) {
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (!toastResult(error)) return;
    toastResult(null, "Student deleted");
    fetchStudents();
  }

  const filtered = students.filter((s) => {
    if (filterProgram && s.program_id !== filterProgram) return false;
    if (filterClass && s.class_id !== filterClass) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.student_id.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const columns = [
    { key: "student_id", label: "Student ID" },
    { key: "name", label: "Name" },
    {
      key: "password",
      label: "Password",
      render: (s: Student) => {
        const revealed = showAllPasswords || revealedPasswords.has(s.id);
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">
              {revealed ? (s.password_hash ?? "—") : "••••••••"}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); togglePassword(s.id); }}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              title={revealed ? "Hide" : "Show"}
            >
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        );
      },
    },
    {
      key: "program_id",
      label: "Program",
      render: (s: Student) => s.programs?.name ?? <span className="text-muted-foreground">—</span>,
      hideOnMobile: true,
    },
    {
      key: "class_id",
      label: "Class",
      render: (s: Student) => s.classes?.name ?? <span className="text-muted-foreground">—</span>,
      hideOnMobile: true,
    },
    {
      key: "gender",
      label: "Gender",
      render: (s: Student) => (s as any).gender ?? <span className="text-muted-foreground">—</span>,
      hideOnMobile: true,
    },
    {
      key: "form",
      label: "Form",
      render: (s: Student) => (s as any).form ?? <span className="text-muted-foreground">—</span>,
      hideOnMobile: true,
    },
    {
      key: "assigned_device_id",
      label: "Device",
      render: (s: Student) => s.devices?.device_id ?? <span className="text-muted-foreground">—</span>,
      hideOnMobile: true,
    },
    {
      key: "actions",
      label: "",
      render: (s: Student) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(s); }}
            className="p-1 text-muted-foreground hover:text-primary transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeletingStudent(s); }}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminOnly><div>
      <PageHeader
        title="Students"
        description="Manage student records and device assignments"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAllPasswords((v) => !v)}
              className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
              title={showAllPasswords ? "Hide all passwords" : "Show all passwords"}
            >
              {showAllPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showAllPasswords ? "Hide passwords" : "Show passwords"}
            </button>
            <ExcelExport
                data={filtered.map((s) => ({
                  student_id: s.student_id,
                  name: s.name,
                  program_name: s.programs?.name ?? "",
                  class_name: s.classes?.name ?? "",
                  gender: (s as any).gender ?? "",
                  form: (s as any).form ?? "",
                  password: s.password_hash ?? "",
                }))}
                filename="students_export"
                sheetName="Students"
              />
            <ExcelImport entity="students" onImportComplete={fetchStudents} />
            <button
              onClick={openAdd}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Add Student
            </button>
          </div>
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs border border-border w-52 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          value={filterProgram}
          onChange={(e) => setFilterProgram(e.target.value)}
          className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs border border-border"
        >
          <option value="">All Programs</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs border border-border"
        >
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <DataTable data={filtered as Record<string, unknown>[]} columns={columns as any} />

      {showAddModal && (
        <StudentFormModal
          title="Add Student"
          form={form}
          setForm={setForm}
          programs={programs}
          classes={classes}
          onSubmit={addStudent}
          onCancel={() => setShowAddModal(false)}
          submitLabel="Add"
        />
      )}

      {editingStudent && (
        <StudentFormModal
          title="Edit Student"
          form={form}
          setForm={setForm}
          programs={programs}
          classes={classes}
          onSubmit={updateStudent}
          onCancel={() => { setEditingStudent(null); setForm(emptyForm); }}
          submitLabel="Save"
          disableStudentId
        />
      )}

      {deletingStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-sm mx-4">
            <h2 className="text-lg font-semibold mb-2">Delete Student</h2>
            <p className="text-sm text-muted-foreground mb-1">
              Are you sure you want to delete this student?
            </p>
            <p className="text-sm font-medium text-foreground mb-4">
              {deletingStudent.name} ({deletingStudent.student_id})
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeletingStudent(null)} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">Cancel</button>
              <button
                onClick={async () => {
                  const id = deletingStudent.id;
                  setDeletingStudent(null);
                  await deleteStudent(id);
                }}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div></AdminOnly>
  );
}
