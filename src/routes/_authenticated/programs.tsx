import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { DataTable } from "../../components/DataTable";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/programs")({
  component: ProgramsPage,
  head: () => ({
    meta: [
      { title: "Programs — OLAG LMS" },
      { name: "description", content: "Manage academic programs" },
    ],
  }),
});

type Program = { id: string; name: string; description: string | null; created_at: string };

function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  async function fetchPrograms() {
    const { data } = await supabase.from("programs").select("*").order("created_at", { ascending: false });
    setPrograms(data ?? []);
  }

  useEffect(() => { fetchPrograms(); }, []);

  async function addProgram() {
    if (!form.name.trim()) return;
    await supabase.from("programs").insert({ name: form.name.trim(), description: form.description.trim() || null });
    setForm({ name: "", description: "" });
    setShowModal(false);
    fetchPrograms();
  }

  async function deleteProgram(id: string) {
    await supabase.from("programs").delete().eq("id", id);
    fetchPrograms();
  }

  const columns = [
    { key: "name", label: "Program Name" },
    { key: "description", label: "Description", render: (p: Program) => p.description ?? <span className="text-muted-foreground">—</span> },
    {
      key: "created_at",
      label: "Created",
      render: (p: Program) => new Date(p.created_at).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "",
      render: (p: Program) => (
        <button onClick={(e) => { e.stopPropagation(); deleteProgram(p.id); }} className="text-xs text-destructive hover:underline">Delete</button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Programs"
        description="Manage academic programs"
        actions={
          <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">Add Program</button>
        }
      />
      <DataTable data={programs as Record<string, unknown>[]} columns={columns as any} />

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">Add Program</h2>
            <div className="space-y-3">
              <input placeholder="Program Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm" />
              <textarea placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm" rows={3} />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">Cancel</button>
              <button onClick={addProgram} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
