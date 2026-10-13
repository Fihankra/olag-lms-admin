import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { DataTable } from "../../components/DataTable";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/use-auth";
import { ExcelExport } from "../../components/ExcelExport";
import { toastResult } from "../../lib/supabase-toast";
import { PasswordInput } from "../../components/PasswordInput";

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
  const [form, setForm] = useState({ name: "", assigned_class_id: "" });
  const [emails, setEmails] = useState<Map<string, string>>(new Map());
  const [passwordTeacher, setPasswordTeacher] = useState<Teacher | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function fetchTeachers() {
    const { data } = await supabase
      .from("teachers")
      .select("*, classes(name)")
      .order("created_at", { ascending: false });
    setTeachers((data as Teacher[]) ?? []);
    fetchEmails();
  }

  async function fetchEmails() {
    const { data, error } = await supabase.rpc("admin_teacher_emails");
    if (error) {
      console.error("fetchEmails error:", error);
      return;
    }
    setEmails(new Map((data ?? []).map((r) => [r.teacher_id, r.email])));
  }

  async function fetchClasses() {
    const { data } = await supabase.from("classes").select("id, name");
    setClasses(data ?? []);
  }

  useEffect(() => {
    fetchTeachers();
    fetchClasses();
  }, []);

  function openEdit(t: Teacher) {
    setEditTeacher(t);
    setForm({
      name: t.name,
      assigned_class_id: t.assigned_class_id ?? "",
    });
    setShowModal(true);
  }

  async function saveTeacher() {
    if (!editTeacher || !form.name.trim()) return;
    const { error } = await supabase
      .from("teachers")
      .update({ name: form.name.trim(), assigned_class_id: form.assigned_class_id || null })
      .eq("id", editTeacher.id);
    if (!toastResult(error)) return;
    toastResult(null, "Teacher updated");
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

  async function setPassword() {
    if (!passwordTeacher) return;
    if (newPassword.length < 6) {
      toastResult({ message: "Password must be at least 6 characters" });
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.rpc("admin_set_teacher_password", {
      _teacher_id: passwordTeacher.id,
      _password: newPassword,
    });
    setSavingPassword(false);
    if (!toastResult(error)) return;
    toastResult(null, `Password updated for ${passwordTeacher.name}`);
    setPasswordTeacher(null);
    setNewPassword("");
  }

  async function deleteTeacher(t: Teacher) {
    if (t.assigned_class_id) {
      toastResult({
        message: `${t.name} is form master of ${t.classes?.name ?? "a class"}. Remove the class assignment before deleting.`,
      });
      return;
    }
    if (!confirm(`Delete teacher "${t.name}" (${t.teacher_id})?`)) return;
    const { error } = await supabase.from("teachers").delete().eq("id", t.id);
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
      key: "email",
      label: "Email",
      render: (t: Teacher) => emails.get(t.id) ?? <span className="text-muted-foreground">—</span>,
    },
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
          <span className="text-xs text-muted-foreground">Not registered</span>
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
          {t.user_id && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPasswordTeacher(t);
                setNewPassword("");
              }}
              className="text-xs text-primary hover:underline whitespace-nowrap"
            >
              Set password
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteTeacher(t);
            }}
            disabled={!!t.assigned_class_id}
            title={
              t.assigned_class_id
                ? "Form masters can't be deleted. Remove their class assignment first."
                : "Delete teacher"
            }
            className="text-xs text-destructive hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
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
        description="Approve registered teachers and assign form masters to classes"
        actions={
          <div className="flex items-center gap-2">
            <ExcelExport
              data={teachers.map((t) => ({
                teacher_id: t.teacher_id,
                name: t.name,
                email: emails.get(t.id) ?? "",
              }))}
              filename="teachers_export"
              sheetName="Teachers"
            />
          </div>
        }
      />
      <DataTable data={teachers as Record<string, unknown>[]} columns={columns as any} />

      {showModal && editTeacher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">Edit Teacher</h2>
            <div className="space-y-3">
              <input
                placeholder="Teacher ID"
                value={editTeacher.teacher_id}
                disabled
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
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordTeacher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-1">Set Password</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {passwordTeacher.name}
              {emails.get(passwordTeacher.id) ? ` (${emails.get(passwordTeacher.id)})` : ""} will be
              asked to change it after signing in.
            </p>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 6 characters)"
              autoFocus
            />
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setPasswordTeacher(null)}
                className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground"
              >
                Cancel
              </button>
              <button
                onClick={setPassword}
                disabled={savingPassword}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {savingPassword ? "Saving…" : "Set Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
