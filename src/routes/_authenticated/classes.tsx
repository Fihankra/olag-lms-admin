import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { DataTable } from "../../components/DataTable";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";
import { AdminOnly } from "../../components/AdminOnly";
import { ExcelImport } from "../../components/ExcelImport";
import { ExcelExport } from "../../components/ExcelExport";
import { toastResult } from "../../lib/supabase-toast";

export const Route = createFileRoute("/_authenticated/classes")({
  component: ClassesPage,
});

type ClassItem = {
  id: string;
  name: string;
  program_id: string;
  created_at: string;
  programs?: { name: string } | null;
};
type Program = { id: string; name: string };
type ClassStats = { formMasters: string[]; total: number; assigned: number };

function ClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editClass, setEditClass] = useState<ClassItem | null>(null);
  const [form, setForm] = useState({ name: "", program_id: "" });
  const [stats, setStats] = useState<Map<string, ClassStats>>(new Map());

  async function fetchClasses() {
    const { data } = await supabase
      .from("classes")
      .select("*, programs(name)")
      .order("created_at", { ascending: false });
    setClasses((data as ClassItem[]) ?? []);
  }

  async function fetchPrograms() {
    const { data } = await supabase.from("programs").select("id, name");
    setPrograms(data ?? []);
  }

  async function fetchStats() {
    const next = new Map<string, ClassStats>();
    const get = (id: string) => {
      let st = next.get(id);
      if (!st) next.set(id, (st = { formMasters: [], total: 0, assigned: 0 }));
      return st;
    };

    const { data: teachers } = await supabase
      .from("teachers")
      .select("name, assigned_class_id")
      .not("assigned_class_id", "is", null);
    for (const t of teachers ?? []) get(t.assigned_class_id!).formMasters.push(t.name);

    // Supabase caps responses at 1000 rows, so page through students
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("students")
        .select("class_id, assigned_device_id")
        .not("class_id", "is", null)
        .range(from, from + PAGE - 1);
      if (error) {
        console.error("fetchStats error:", error);
        break;
      }
      for (const s of data ?? []) {
        const st = get(s.class_id!);
        st.total++;
        if (s.assigned_device_id) st.assigned++;
      }
      if (!data || data.length < PAGE) break;
    }
    setStats(next);
  }

  useEffect(() => {
    fetchClasses();
    fetchPrograms();
    fetchStats();
  }, []);

  const statsFor = (c: ClassItem) => stats.get(c.id) ?? { formMasters: [], total: 0, assigned: 0 };

  function openAdd() {
    setEditClass(null);
    setForm({ name: "", program_id: "" });
    setShowModal(true);
  }

  function openEdit(c: ClassItem) {
    setEditClass(c);
    setForm({ name: c.name, program_id: c.program_id });
    setShowModal(true);
  }

  async function saveClass() {
    if (!form.name.trim() || !form.program_id) return;
    const payload = { name: form.name.trim(), program_id: form.program_id };
    if (editClass) {
      const { error } = await supabase.from("classes").update(payload).eq("id", editClass.id);
      if (!toastResult(error)) return;
      toastResult(null, "Class updated");
    } else {
      const { error } = await supabase.from("classes").insert(payload);
      if (!toastResult(error)) return;
      toastResult(null, "Class added");
    }
    setShowModal(false);
    fetchClasses();
  }

  async function deleteClass(id: string) {
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (!toastResult(error)) return;
    toastResult(null, "Class deleted");
    fetchClasses();
    fetchStats();
  }

  const columns = [
    { key: "name", label: "Class Name" },
    { key: "program_id", label: "Program", render: (c: ClassItem) => c.programs?.name ?? "—" },
    {
      key: "form_master",
      label: "Form Master",
      render: (c: ClassItem) => {
        const names = statsFor(c).formMasters;
        return names.length ? names.join(", ") : <span className="text-muted-foreground">—</span>;
      },
    },
    { key: "students", label: "Students", render: (c: ClassItem) => statsFor(c).total },
    {
      key: "assigned",
      label: "Assigned Device",
      render: (c: ClassItem) => statsFor(c).assigned,
      hideOnMobile: true,
    },
    {
      key: "unassigned",
      label: "Unassigned",
      render: (c: ClassItem) => {
        const st = statsFor(c);
        const n = st.total - st.assigned;
        return <span className={n > 0 ? "text-destructive" : ""}>{n}</span>;
      },
      hideOnMobile: true,
    },
    {
      key: "created_at",
      label: "Created",
      render: (c: ClassItem) => new Date(c.created_at).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "",
      render: (c: ClassItem) => (
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEdit(c);
            }}
            className="text-xs text-primary hover:underline"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteClass(c.id);
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
    <AdminOnly>
      <div>
        <PageHeader
          title="Classes"
          description="Manage classes linked to programs"
          actions={
            <div className="flex items-center gap-2">
              <ExcelExport
                data={classes.map((c) => {
                  const st = statsFor(c);
                  return {
                    name: c.name,
                    program_name: c.programs?.name ?? "",
                    form_master: st.formMasters.join(", "),
                    students: st.total,
                    assigned_device: st.assigned,
                    unassigned: st.total - st.assigned,
                  };
                })}
                filename="classes_export"
                sheetName="Classes"
              />
              <ExcelImport entity="classes" onImportComplete={fetchClasses} />
              <button
                onClick={openAdd}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Add Class
              </button>
            </div>
          }
        />
        <DataTable data={classes as Record<string, unknown>[]} columns={columns as any} />

        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
              <h2 className="text-lg font-semibold mb-4">
                {editClass ? "Edit Class" : "Add Class"}
              </h2>
              <div className="space-y-3">
                <input
                  placeholder="Class Name"
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
                    <option key={p.id} value={p.id}>
                      {p.name}
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
                  onClick={saveClass}
                  className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {editClass ? "Save" : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminOnly>
  );
}
