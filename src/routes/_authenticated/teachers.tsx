import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { DataTable } from "../../components/DataTable";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/use-auth";
import { ExcelImport } from "../../components/ExcelImport";
import { ExcelExport } from "../../components/ExcelExport";
import { toastResult } from "../../lib/supabase-toast";

export const Route = createFileRoute("/_authenticated/teachers")({
  component: TeachersPage,
});

type Teacher = {
  id: string;
  teacher_id: string;
  name: string;
  assigned_class_id: string | null;
  user_id: string | null;
  approved: boolean;
  created_at: string;
  classes?: { name: string } | null;
};

type ClassItem = { id: string; name: string };

function TeachersPage() {
  const { role } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);
  const [form, setForm] = useState({ teacher_id: "", name: "", assigned_class_id: "" });

  async function fetchTeachers() {
    const { data } = await supabase
      .from("teachers")
      .select("*, classes(name)")
      .order("created_at", { ascending: false });
    setTeachers((data as Teacher[]) ?? []);
  }

  async function fetchClasses() {
    const { data } = await supabase.from("classes").select("id, name");
    setClasses(data ?? []);
  }

  useEffect(() => {
    fetchTeachers();
    fetchClasses();
  }, []);

  function openAdd() {
    setEditTeacher(null);
    setForm({ teacher_id: "", name: "", assigned_class_id: "" });
    setShowModal(true);
  }

  function openEdit(t: Teacher) {
    setEditTeacher(t);
    setForm({
      teacher_id: t.teacher_id,
      name: t.name,
      assigned_class_id: t.assigned_class_id ?? "",
    });
    setShowModal(true);
  }

  async function saveTeacher() {
    if (!form.teacher_id.trim() || !form.name.trim()) return;
    const payload: any = {
      teacher_id: form.teacher_id.trim(),
      name: form.name.trim(),
      assigned_class_id: form.assigned_class_id || null,
    };

    if (editTeacher) {
      const { error } = await supabase.from("teachers").update(payload).eq("id", editTeacher.id);
      if (!toastResult(error)) return;
      toastResult(null, "Teacher updated");
    } else {
      payload.approved = true;
      const { error } = await supabase.from("teachers").insert(payload);
      if (!toastResult(error)) return;
      toastResult(null, "Teacher added");
    }
    setShowModal(false);
    fetchTeachers();
  }

  async function toggleApproval(t: Teacher) {
    const { error } = await supabase
      .from("teachers")
      .update({ approved: !t.approved })
      .eq("id", t.id);
    if (!toastResult(error)) return;
    toastResult(null, t.approved ? "Teacher approval revoked" : "Teacher approved");
    fetchTeachers();
  }

  async function deleteTeacher(id: string) {
    const { error } = await supabase.from("teachers").delete().eq("id", id);
    if (!toastResult(error)) return;
    toastResult(null, "Teacher deleted");
    fetchTeachers();
  }

  // Only show for admin
  if (role !== "admin") return null;

  const columns = [
    { key: "teacher_id", label: "Teacher ID" },
    { key: "name", label: "Name" },
    {
      key: "approved",
      label: "Status",
      render: (t: Teacher) =>
        t.user_id ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleApproval(t);
            }}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              t.approved
                ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
            }`}
          >
            {t.approved ? "Approved" : "Pending — Click to Approve"}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">Manual</span>
        ),
    },
    {
      key: "assigned_class_id",
      label: "Form Master Of",
      render: (t: Teacher) => t.classes?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "created_at",
      label: "Created",
      render: (t: Teacher) => new Date(t.created_at).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "",
      render: (t: Teacher) => (
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEdit(t);
            }}
            className="text-xs text-primary hover:underline"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteTeacher(t.id);
            }}
            className="text-xs text-destructive hover:underline"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Teachers"
        description="Manage teachers and assign form masters to classes"
        actions={
          <div className="flex items-center gap-2">
            <ExcelExport
              data={teachers.map((t) => ({ teacher_id: t.teacher_id, name: t.name }))}
              filename="teachers_export"
              sheetName="Teachers"
            />
            <ExcelImport entity="teachers" onImportComplete={fetchTeachers} />
            <button
              onClick={openAdd}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Add Teacher
            </button>
          </div>
        }
      />
      <DataTable data={teachers as Record<string, unknown>[]} columns={columns as any} />

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">
              {editTeacher ? "Edit Teacher" : "Add Teacher"}
            </h2>
            <div className="space-y-3">
              <input
                placeholder="Teacher ID"
                value={form.teacher_id}
                onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                disabled={!!editTeacher}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm disabled:opacity-50"
              />
              <input
                placeholder="Full Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
              />
              <select
                value={form.assigned_class_id}
                onChange={(e) => setForm({ ...form, assigned_class_id: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
              >
                <option value="">No class (not a form master)</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground"
              >
                Cancel
              </button>
              <button
                onClick={saveTeacher}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {editTeacher ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
