import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/use-auth";
import { Users2, Trash2, MessageCircle, X, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/groups")({
  component: GroupsPage,
  head: () => ({
    meta: [
      { title: "Groups — OLAG LMS" },
      { name: "description", content: "Manage groups" },
    ],
  }),
});

type Group = {
  id: string;
  name: string;
  description: string | null;
  teacher_id: string;
  created_at: string;
};

type Teacher = { id: string; name: string };
type Student = { id: string; name: string; student_id: string };
type Member = { id: string; student_id: string; students: Student | null };
type Message = {
  id: string;
  content: string;
  created_at: string;
  sender_student_id: string | null;
  sender_teacher_id: string | null;
  students: { name: string } | null;
  teachers: { name: string } | null;
};

function GroupsPage() {
  const { teacherRecord, role } = useAuth();
  const isAdmin = role === "admin";
  const [groups, setGroups] = useState<(Group & { teacher_name?: string })[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    teacher_id: "",
    student_ids: [] as string[],
  });

  // Chat panel
  const [openGroup, setOpenGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [addStudentId, setAddStudentId] = useState("");

  async function fetchGroups() {
    let query = supabase
      .from("groups")
      .select("*, teachers(name)")
      .order("created_at", { ascending: false });
    if (role === "teacher" && teacherRecord) {
      query = query.eq("teacher_id", teacherRecord.id);
    }
    const { data } = await query;
    setGroups(
      ((data as any[]) ?? []).map((g) => ({ ...g, teacher_name: g.teachers?.name })),
    );
  }

  async function fetchLookups() {
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from("teachers").select("id, name").eq("approved", true).order("name"),
      supabase.from("students").select("id, name, student_id").order("name"),
    ]);
    setTeachers((t as Teacher[]) ?? []);
    setStudents((s as Student[]) ?? []);
  }

  useEffect(() => {
    fetchGroups();
    fetchLookups();
  }, [teacherRecord, role]);

  async function createGroup() {
    if (!form.name.trim()) return;
    const teacher_id = isAdmin ? form.teacher_id : teacherRecord?.id;
    if (!teacher_id) return;

    const { data: g, error } = await supabase
      .from("groups")
      .insert({
        name: form.name.trim(),
        description: form.description.trim() || null,
        teacher_id,
      })
      .select()
      .single();
    if (error || !g) return;

    if (form.student_ids.length > 0) {
      await supabase
        .from("group_members")
        .insert(form.student_ids.map((sid) => ({ group_id: g.id, student_id: sid })));
    }

    setForm({ name: "", description: "", teacher_id: "", student_ids: [] });
    setShowModal(false);
    fetchGroups();
  }

  async function deleteGroup(id: string) {
    await supabase.from("group_members").delete().eq("group_id", id);
    await supabase.from("messages").delete().eq("group_id", id);
    await supabase.from("groups").delete().eq("id", id);
    fetchGroups();
  }

  async function openChat(g: Group) {
    setOpenGroup(g);
    const [{ data: msgs }, { data: mems }] = await Promise.all([
      supabase
        .from("messages")
        .select("*, students(name), teachers(name)")
        .eq("group_id", g.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("group_members")
        .select("id, student_id, students(id, name, student_id)")
        .eq("group_id", g.id),
    ]);
    setMessages((msgs as any) ?? []);
    setMembers((mems as any) ?? []);
  }

  async function addMember() {
    if (!openGroup || !addStudentId) return;
    await supabase
      .from("group_members")
      .insert({ group_id: openGroup.id, student_id: addStudentId });
    setAddStudentId("");
    openChat(openGroup);
  }

  async function removeMember(memberId: string) {
    await supabase.from("group_members").delete().eq("id", memberId);
    if (openGroup) openChat(openGroup);
  }

  const canCreate = isAdmin || !!teacherRecord;

  return (
    <div>
      <PageHeader
        title="Groups"
        description={isAdmin ? "Manage all groups and view chats" : "Organize students into groups"}
        actions={
          canCreate ? (
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
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
            <div
              key={g.id}
              className="bg-card rounded-lg border border-border p-4 hover:border-primary/40 transition-colors group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Users2 className="h-5 w-5 text-primary shrink-0" />
                  <span className="font-medium text-foreground truncate">{g.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openChat(g)}
                    className="p-1 rounded hover:bg-primary/10 text-primary"
                    title="View chat"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteGroup(g.id)}
                    className="p-1 rounded hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete group"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>{new Date(g.created_at).toLocaleDateString()}</span>
                {isAdmin && g.teacher_name && <span>by {g.teacher_name}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">New Group</h2>
            <div className="space-y-3">
              <input
                placeholder="Group Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                autoFocus
              />
              <textarea
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                rows={2}
              />
              {isAdmin && (
                <select
                  value={form.teacher_id}
                  onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                >
                  <option value="">Assign to teacher…</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Students</p>
                <div className="max-h-48 overflow-y-auto border border-border rounded-md divide-y divide-border">
                  {students.map((s) => {
                    const checked = form.student_ids.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/30"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              student_ids: e.target.checked
                                ? [...form.student_ids, s.id]
                                : form.student_ids.filter((x) => x !== s.id),
                            })
                          }
                        />
                        <span className="truncate">
                          {s.name}{" "}
                          <span className="text-muted-foreground">({s.student_id})</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground"
              >
                Cancel
              </button>
              <button
                onClick={createGroup}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat drawer */}
      {openGroup && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-50">
          <div className="bg-card border-l border-border w-full max-w-md h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="min-w-0">
                <h2 className="font-semibold truncate">{openGroup.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {members.length} member{members.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={() => setOpenGroup(null)}
                className="p-1.5 rounded hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Members */}
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Members</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {members.length === 0 && (
                  <span className="text-xs text-muted-foreground">No members yet</span>
                )}
                {members.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs"
                  >
                    {m.students?.name ?? "?"}
                    <button
                      onClick={() => removeMember(m.id)}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <select
                  value={addStudentId}
                  onChange={(e) => setAddStudentId(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-md bg-input border border-border text-xs"
                >
                  <option value="">Add student…</option>
                  {students
                    .filter((s) => !members.some((m) => m.student_id === s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.student_id})
                      </option>
                    ))}
                </select>
                <button
                  onClick={addMember}
                  disabled={!addStudentId}
                  className="px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No messages yet</p>
              ) : (
                messages.map((m) => {
                  const sender =
                    m.teachers?.name ?? m.students?.name ?? "Unknown";
                  const isTeacher = !!m.sender_teacher_id;
                  return (
                    <div key={m.id} className="bg-muted/40 rounded-md px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <span
                          className={`text-xs font-medium ${isTeacher ? "text-primary" : "text-foreground"}`}
                        >
                          {sender} {isTeacher && <span className="text-muted-foreground">(teacher)</span>}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(m.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
