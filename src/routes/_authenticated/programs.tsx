import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { DataTable } from "../../components/DataTable";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";
import { AdminOnly } from "../../components/AdminOnly";
import { ExcelImport } from "../../components/ExcelImport";
import { ExcelExport } from "../../components/ExcelExport";
import { toastResult } from "../../lib/supabase-toast";

export const Route = createFileRoute("/_authenticated/programs")({
  component: ProgramsPage,
});

type Program = { id: string; name: string; description: string | null; created_at: string };

function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editProgram, setEditProgram] = useState<Program | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  async function fetchPrograms() {
    const { data } = await supabase
      .from("programs")
      .select("*")
      .order("created_at", { ascending: false });
    setPrograms(data ?? []);
  }

  useEffect(() => {
    fetchPrograms();
  }, []);

  function openAdd() {
    setEditProgram(null);
    setForm({ name: "", description: "" });
    setShowModal(true);
  }

  function openEdit(p: Program) {
    setEditProgram(p);
    setForm({ name: p.name, description: p.description ?? "" });
    setShowModal(true);
  }

  async function saveProgram() {
    if (!form.name.trim()) return;
    const payload = { name: form.name.trim(), description: form.description.trim() || null };
    if (editProgram) {
      const { error } = await supabase.from("programs").update(payload).eq("id", editProgram.id);
      if (!toastResult(error)) return;
      toastResult(null, "Program updated");
    } else {
      const { error } = await supabase.from("programs").insert(payload);
      if (!toastResult(error)) return;
      toastResult(null, "Program added");
    }
    setShowModal(false);
    fetchPrograms();
  }

  async function deleteProgram(id: string) {
    const { error } = await supabase.from("programs").delete().eq("id", id);
    if (!toastResult(error)) return;
    toastResult(null, "Program deleted");
    fetchPrograms();
  }

  const columns = [
    { key: "name", label: "Program Name" },
    {
      key: "description",
      label: "Description",
      render: (p: Program) => p.description ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "created_at",
      label: "Created",
      render: (p: Program) => new Date(p.created_at).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "",
      render: (p: Program) => (
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEdit(p);
            }}
            className="text-xs text-primary hover:underline"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteProgram(p.id);
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
          title="Programs"
          description="Manage academic programs"
          actions={
            <div className="flex items-center gap-2">
              <ExcelExport
                data={programs.map((p) => ({ name: p.name, description: p.description ?? "" }))}
                filename="programs_export"
                sheetName="Programs"
              />
              <ExcelImport entity="programs" onImportComplete={fetchPrograms} />
              <button
                onClick={openAdd}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Add Program
              </button>
            </div>
          }
        />
        <DataTable data={programs as Record<string, unknown>[]} columns={columns as any} />

        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
              <h2 className="text-lg font-semibold mb-4">
                {editProgram ? "Edit Program" : "Add Program"}
              </h2>
              <div className="space-y-3">
                <input
                  placeholder="Program Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                />
                <textarea
                  placeholder="Description (optional)"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={saveProgram}
                  className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {editProgram ? "Save" : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminOnly>
  );
}
