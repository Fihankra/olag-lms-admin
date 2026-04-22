import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { DataTable } from "../../components/DataTable";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";
import { AdminOnly } from "../../components/AdminOnly";
import { ExcelImport } from "../../components/ExcelImport";
import { Pencil, Trash2 } from "lucide-react";

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
            onChange={(e) => setForm({ ...form, program_id: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
          >
            <option value="">Select Program</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={form.class_id}
            onChange={(e) => setForm({ ...form, class_id: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
          >
            <option value="">Select Class</option>
            {classes.filter((c) => !form.program_id || c.program_id === form.program_id).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
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
          <button onClick={onSubmit} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">{submitLabel}</button>
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
  const [filterClass, setFilterClass] = useState("");

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
    await supabase.from("students").insert({
      student_id: form.student_id.trim(),
      name: form.name.trim(),
      program_id: form.program_id || null,
      class_id: form.class_id || null,
      gender: form.gender || null,
      form: form.form_level || null,
    } as any);
    setForm(emptyForm);
    setShowAddModal(false);
    fetchStudents();
  }

  async function updateStudent() {
    if (!editingStudent || !form.name.trim()) return;
    await supabase.from("students").update({
      name: form.name.trim(),
      program_id: form.program_id || null,
      class_id: form.class_id || null,
      gender: form.gender || null,
      form: form.form_level || null,
    } as any).eq("id", editingStudent.id);
    setEditingStudent(null);
    setForm(emptyForm);
    fetchStudents();
  }

  async function deleteStudent(id: string) {
    await supabase.from("students").delete().eq("id", id);
    fetchStudents();
  }

  const filtered = students.filter((s) => {
    if (filterProgram && s.program_id !== filterProgram) return false;
    if (filterClass && s.class_id !== filterClass) return false;
    return true;
  });

  const columns = [
    { key: "student_id", label: "Student ID" },
    { key: "name", label: "Name" },
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
            onClick={(e) => { e.stopPropagation(); deleteStudent(s.id); }}
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
    </div></AdminOnly>
  );
}
