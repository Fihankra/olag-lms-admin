import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { DataTable } from "../../components/DataTable";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";
import { AdminOnly } from "../../components/AdminOnly";

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
  programs?: { name: string } | null;
  classes?: { name: string } | null;
  devices?: { device_id: string } | null;
};

type Program = { id: string; name: string };
type ClassItem = { id: string; name: string; program_id: string };

function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ student_id: "", name: "", program_id: "", class_id: "" });
  const [filterProgram, setFilterProgram] = useState("");
  const [filterClass, setFilterClass] = useState("");

  async function fetchStudents() {
    const { data } = await supabase
      .from("students")
      .select("*, programs(name), classes(name), devices(device_id)")
      .order("created_at", { ascending: false });
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

  async function addStudent() {
    if (!form.student_id.trim() || !form.name.trim()) return;
    await supabase.from("students").insert({
      student_id: form.student_id.trim(),
      name: form.name.trim(),
      program_id: form.program_id || null,
      class_id: form.class_id || null,
    });
    setForm({ student_id: "", name: "", program_id: "", class_id: "" });
    setShowModal(false);
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
    },
    {
      key: "class_id",
      label: "Class",
      render: (s: Student) => s.classes?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "assigned_device_id",
      label: "Device",
      render: (s: Student) => s.devices?.device_id ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "actions",
      label: "",
      render: (s: Student) => (
        <button
          onClick={(e) => { e.stopPropagation(); deleteStudent(s.id); }}
          className="text-xs text-destructive hover:underline"
        >
          Delete
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Students"
        description="Manage student records and device assignments"
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Add Student
          </button>
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

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">Add Student</h2>
            <div className="space-y-3">
              <input
                placeholder="Student ID"
                value={form.student_id}
                onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
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
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">Cancel</button>
              <button onClick={addStudent} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
