import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/use-auth";
import { Users2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/groups")({
  component: GroupsPage,
  head: () => ({
    meta: [
      { title: "Groups — OLAG LMS" },
      { name: "description", content: "Manage teacher groups" },
    ],
  }),
});

type Group = {
  id: string;
  name: string;
  description: string | null;
  teacher_id: string;
  created_at: string;
  member_count?: number;
};

function GroupsPage() {
  const { teacherRecord, role } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  async function fetchGroups() {
    let query = supabase.from("groups").select("*").order("created_at", { ascending: false });
    // Teachers only see their own groups
    if (role === "teacher" && teacherRecord) {
      query = query.eq("teacher_id", teacherRecord.id);
    }
    const { data } = await query;
    setGroups((data as Group[]) ?? []);
  }

  useEffect(() => { fetchGroups(); }, [teacherRecord]);

  async function createGroup() {
    if (!form.name.trim() || !teacherRecord) return;
    await supabase.from("groups").insert({
      name: form.name.trim(),
      description: form.description.trim() || null,
      teacher_id: teacherRecord.id,
    });
    setForm({ name: "", description: "" });
    setShowModal(false);
    fetchGroups();
  }

  async function deleteGroup(id: string) {
    await supabase.from("groups").delete().eq("id", id);
    fetchGroups();
  }

  return (
    <div>
      <PageHeader
        title="Groups"
        description="Organize students into groups"
        actions={
          teacherRecord ? (
            <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              New Group
            </button>
          ) : undefined
        }
      />

      {groups.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center">
          <Users2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No groups yet</h2>
          <p className="text-sm text-muted-foreground">Create a group to organize students.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <div key={g.id} className="bg-card rounded-lg border border-border p-4 hover:border-primary/40 transition-colors group">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users2 className="h-5 w-5 text-primary shrink-0" />
                  <span className="font-medium text-foreground">{g.name}</span>
                </div>
                <button onClick={() => deleteGroup(g.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" title="Delete group">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
              <p className="text-xs text-muted-foreground mt-2">{new Date(g.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">New Group</h2>
            <div className="space-y-3">
              <input placeholder="Group Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm" autoFocus />
              <textarea placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm" rows={3} />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">Cancel</button>
              <button onClick={createGroup} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
