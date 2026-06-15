/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/use-auth";
import {
  Ban,
  CheckCircle,
  GraduationCap,
  MessageCircle,
  Send,
  Trash2,
  UserMinus,
  UserPlus,
  Users2,
  X,
} from "lucide-react";
import { toastResult } from "../../lib/supabase-toast";

export const Route = createFileRoute("/_authenticated/groups")({
  component: GroupsPage,
  head: () => ({
    meta: [{ title: "Groups — OLAG LMS" }, { name: "description", content: "Manage groups" }],
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
type ClassItem = { id: string; name: string };
type Student = { id: string; name: string; student_id: string; class_id: string | null };
type Member = { id: string; student_id: string; blocked: boolean; students: Student | null };
type GroupTeacher = { id: string; teacher_id: string; teachers: { name: string } | null };
type Message = {
  id: string;
  content: string;
  created_at: string;
  sender_student_id: string | null;
  sender_teacher_id: string | null;
  students: { name: string } | null;
  teachers: { name: string } | null;
};

type PanelTab = "messages" | "members" | "teachers";

function GroupsPage() {
  const { teacherRecord, role } = useAuth();
  const isAdmin = role === "admin";

  const [groups, setGroups] = useState<(Group & { teacher_name?: string })[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    teacher_id: "",
    student_ids: [] as string[],
  });

  // Chat panel state
  const [openGroup, setOpenGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [groupTeachers, setGroupTeachers] = useState<GroupTeacher[]>([]);
  const [activeTab, setActiveTab] = useState<PanelTab>("messages");
  const [addStudentId, setAddStudentId] = useState("");
  const [addClassId, setAddClassId] = useState("");
  const [addTeacherId, setAddTeacherId] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function fetchGroups() {
    if (role === "teacher" && teacherRecord) {
      // Fetch group IDs where this teacher is a co-teacher
      const { data: coRows } = await supabase
        .from("group_teachers")
        .select("group_id")
        .eq("teacher_id", teacherRecord.id);

      const coGroupIds = ((coRows as any[]) ?? []).map((r) => r.group_id);

      let query = supabase
        .from("groups")
        .select("*, teachers(name)")
        .order("created_at", { ascending: false });

      if (coGroupIds.length > 0) {
        query = query.or(`teacher_id.eq.${teacherRecord.id},id.in.(${coGroupIds.join(",")})`);
      } else {
        query = query.eq("teacher_id", teacherRecord.id);
      }

      const { data } = await query;
      setGroups(((data as any[]) ?? []).map((g) => ({ ...g, teacher_name: g.teachers?.name })));
    } else {
      // Admin sees all groups
      const { data } = await supabase
        .from("groups")
        .select("*, teachers(name)")
        .order("created_at", { ascending: false });
      setGroups(((data as any[]) ?? []).map((g) => ({ ...g, teacher_name: g.teachers?.name })));
    }
  }

  async function fetchLookups() {
    const [{ data: t }, { data: c }, { data: s }] = await Promise.all([
      supabase.from("teachers").select("id, name").eq("approved", true).order("name"),
      supabase.from("classes").select("id, name").order("name"),
      supabase.from("students").select("id, name, student_id, class_id").order("name"),
    ]);
    setTeachers((t as Teacher[]) ?? []);
    setClasses((c as ClassItem[]) ?? []);
    setStudents((s as Student[]) ?? []);
  }

  useEffect(() => {
    fetchGroups();
    fetchLookups();
  }, [teacherRecord, role]);

  useEffect(() => {
    if (activeTab === "messages") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab]);

  async function createGroup() {
    if (!form.name.trim()) return;
    const teacher_id = isAdmin ? form.teacher_id : teacherRecord?.id;
    if (!teacher_id) return;

    const { data: g, error } = await supabase
      .from("groups")
      .insert({ name: form.name.trim(), description: form.description.trim() || null, teacher_id })
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
    await supabase.from("group_teachers").delete().eq("group_id", id);
    await supabase.from("groups").delete().eq("id", id);
    fetchGroups();
  }

  async function fetchPanelData(g: Group) {
    const [{ data: msgs }, { data: mems, error: memsErr }, { data: gts, error: gtsErr }] =
      await Promise.all([
        supabase
          .from("messages")
          .select("*, students(name), teachers(name)")
          .eq("group_id", g.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("group_members")
          .select("id, student_id, blocked, students(id, name, student_id)")
          .eq("group_id", g.id),
        supabase
          .from("group_teachers")
          .select("id, teacher_id, teachers(name)")
          .eq("group_id", g.id),
      ]);

    setMessages((msgs as any) ?? []);

    // Fallback if blocked column hasn't been migrated yet
    if (memsErr) {
      const { data: fallback } = await supabase
        .from("group_members")
        .select("id, student_id, students(id, name, student_id)")
        .eq("group_id", g.id);
      setMembers(((fallback as any[]) ?? []).map((m) => ({ ...m, blocked: false })));
    } else {
      setMembers((mems as any) ?? []);
    }

    // Fallback if group_teachers table hasn't been created yet
    setGroupTeachers(gtsErr ? [] : ((gts as any) ?? []));
  }

  async function openChat(g: Group) {
    setOpenGroup(g);
    setActiveTab("messages");
    await fetchPanelData(g);
  }

  async function refreshPanel() {
    if (openGroup) await fetchPanelData(openGroup);
  }

  async function sendMessage() {
    if (!openGroup || !newMessage.trim() || sending) return;
    setSending(true);
    const payload: any = { group_id: openGroup.id, content: newMessage.trim() };
    if (teacherRecord) payload.sender_teacher_id = teacherRecord.id;
    const { error } = await supabase.from("messages").insert(payload);
    toastResult(error ?? null, "Message sent");
    if (!error) {
      setNewMessage("");
      refreshPanel();
    }
    setSending(false);
  }

  async function addMember() {
    if (!openGroup || !addStudentId) return;
    await supabase
      .from("group_members")
      .insert({ group_id: openGroup.id, student_id: addStudentId });
    setAddStudentId("");
    refreshPanel();
  }

  async function addClassMembers() {
    if (!openGroup || !addClassId) return;
    const existingIds = new Set(members.map((m) => m.student_id));
    const newStudents = students.filter((s) => s.class_id === addClassId && !existingIds.has(s.id));
    if (newStudents.length > 0) {
      await supabase
        .from("group_members")
        .insert(newStudents.map((s) => ({ group_id: openGroup.id, student_id: s.id })));
    }
    setAddClassId("");
    refreshPanel();
  }

  async function removeMember(memberId: string) {
    await supabase.from("group_members").delete().eq("id", memberId);
    refreshPanel();
  }

  async function toggleBlock(memberId: string, blocked: boolean) {
    const { error } = await supabase.from("group_members").update({ blocked }).eq("id", memberId);
    toastResult(error ?? null, blocked ? "Student blocked (read-only)" : "Student unblocked");
    if (!error) refreshPanel();
  }

  async function addGroupTeacher() {
    if (!openGroup || !addTeacherId) return;
    const { error } = await supabase
      .from("group_teachers")
      .insert({ group_id: openGroup.id, teacher_id: addTeacherId });
    toastResult(error ?? null, "Co-teacher added");
    if (!error) {
      setAddTeacherId("");
      refreshPanel();
    }
  }

  async function removeGroupTeacher(id: string) {
    const { error } = await supabase.from("group_teachers").delete().eq("id", id);
    toastResult(error ?? null, "Co-teacher removed");
    if (!error) refreshPanel();
  }

  function toggleClassInForm(classId: string, add: boolean) {
    const ids = students.filter((s) => s.class_id === classId).map((s) => s.id);
    setForm((prev) => ({
      ...prev,
      student_ids: add
        ? Array.from(new Set([...prev.student_ids, ...ids]))
        : prev.student_ids.filter((id) => !ids.includes(id)),
    }));
  }

  const canCreate = isAdmin || !!teacherRecord;
  const isGroupManager = isAdmin || (!!teacherRecord && teacherRecord.id === openGroup?.teacher_id);
  const availableTeachersToAdd = teachers.filter(
    (t) => t.id !== openGroup?.teacher_id && !groupTeachers.some((gt) => gt.teacher_id === t.id),
  );

  return (
    <div>
      <PageHeader
        title="Groups"
        description={isAdmin ? "Manage all groups and view chats" : "Organize students into groups"}
        actions={
          canCreate ? (
            <button
              type="button"
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
                    type="button"
                    onClick={() => openChat(g)}
                    className="p-1 rounded hover:bg-primary/10 text-primary"
                    title="Open group"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
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
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs text-muted-foreground">Students</p>
                  {form.student_ids.length > 0 && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      {form.student_ids.length} selected
                    </span>
                  )}
                </div>
                <div className="mb-2 flex gap-2">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) toggleClassInForm(e.target.value, true);
                      e.target.value = "";
                    }}
                    className="flex-1 px-2 py-1.5 rounded-md bg-input border border-border text-foreground text-xs"
                  >
                    <option value="">Add entire class…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({students.filter((s) => s.class_id === c.id).length} students)
                      </option>
                    ))}
                  </select>
                  {form.student_ids.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, student_ids: [] }))}
                      className="px-2 py-1.5 text-xs rounded-md bg-secondary text-secondary-foreground whitespace-nowrap"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto border border-border rounded-md divide-y divide-border">
                  {students.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        checked={form.student_ids.includes(s.id)}
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
                        {s.name} <span className="text-muted-foreground">({s.student_id})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createGroup}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group panel */}
      {openGroup && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-50">
          <div className="bg-card border-l border-border w-full max-w-md h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="min-w-0">
                <h2 className="font-semibold truncate">{openGroup.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {members.length} student{members.length === 1 ? "" : "s"} ·{" "}
                  {1 + groupTeachers.length} teacher{groupTeachers.length > 0 ? "s" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenGroup(null)}
                className="p-1.5 rounded hover:bg-muted ml-2 shrink-0"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border shrink-0">
              {(["messages", "members", "teachers"] as PanelTab[]).map((tab) => (
                <button
                  type="button"
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    activeTab === tab
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "members"
                    ? `Members (${members.length})`
                    : tab === "teachers"
                      ? `Teachers (${1 + groupTeachers.length})`
                      : "Messages"}
                </button>
              ))}
            </div>

            {/* ── Messages tab ── */}
            {activeTab === "messages" && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {messages.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-8">
                      No messages yet
                    </p>
                  ) : (
                    messages.map((m) => {
                      const isTeacher = !!m.sender_teacher_id;
                      const isAdminMsg = !m.sender_teacher_id && !m.sender_student_id;
                      const sender = isAdminMsg
                        ? "Admin"
                        : (m.teachers?.name ?? m.students?.name ?? "Unknown");
                      return (
                        <div key={m.id} className="bg-muted/40 rounded-md px-3 py-2">
                          <div className="flex items-baseline justify-between gap-2 mb-0.5">
                            <span
                              className={`text-xs font-medium ${
                                isAdminMsg
                                  ? "text-amber-600 dark:text-amber-400"
                                  : isTeacher
                                    ? "text-primary"
                                    : "text-foreground"
                              }`}
                            >
                              {sender}{" "}
                              {isTeacher && (
                                <span className="text-muted-foreground font-normal">(teacher)</span>
                              )}
                              {isAdminMsg && (
                                <span className="text-muted-foreground font-normal">(admin)</span>
                              )}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {new Date(m.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="px-4 py-3 border-t border-border shrink-0">
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                      rows={2}
                      className="flex-1 px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm resize-none"
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || sending}
                      className="p-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      title="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── Members tab ── */}
            {activeTab === "members" && (
              <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
                <div className="px-4 pt-3 pb-3 border-b border-border space-y-2 shrink-0">
                  <div className="flex gap-2">
                    <select
                      value={addClassId}
                      onChange={(e) => setAddClassId(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-md bg-input border border-border text-xs"
                    >
                      <option value="">Add entire class…</option>
                      {classes.map((c) => {
                        const available = students.filter(
                          (s) => s.class_id === c.id && !members.some((m) => m.student_id === s.id),
                        );
                        if (available.length === 0) return null;
                        return (
                          <option key={c.id} value={c.id}>
                            {c.name} ({available.length} available)
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      onClick={addClassMembers}
                      disabled={!addClassId}
                      className="px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
                      title="Add class"
                    >
                      <GraduationCap className="h-3.5 w-3.5" />
                    </button>
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
                      type="button"
                      onClick={addMember}
                      disabled={!addStudentId}
                      className="px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
                      title="Add student"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-border">
                  {members.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-8">No members yet</p>
                  )}
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className={`flex items-center justify-between px-4 py-2.5 ${
                        m.blocked ? "bg-destructive/5" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {m.students?.name ?? "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {m.students?.student_id}
                          {m.blocked && (
                            <span className="ml-1.5 text-destructive font-medium">· read-only</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleBlock(m.id, !m.blocked)}
                          className={`p-1.5 rounded transition-colors ${
                            m.blocked
                              ? "text-amber-600 hover:bg-amber-500/10"
                              : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          }`}
                          title={m.blocked ? "Unblock — allow sending" : "Block — read-only"}
                        >
                          {m.blocked ? (
                            <CheckCircle className="h-3.5 w-3.5" />
                          ) : (
                            <Ban className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMember(m.id)}
                          className="p-1.5 rounded text-destructive hover:bg-destructive/10 transition-colors"
                          title="Remove from group"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Teachers tab ── */}
            {activeTab === "teachers" && (
              <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
                {isGroupManager && (
                  <div className="px-4 pt-3 pb-3 border-b border-border shrink-0">
                    <div className="flex gap-2">
                      <select
                        value={addTeacherId}
                        onChange={(e) => setAddTeacherId(e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-md bg-input border border-border text-xs"
                      >
                        <option value="">Add co-teacher…</option>
                        {availableTeachersToAdd.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={addGroupTeacher}
                        disabled={!addTeacherId}
                        className="px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
                        title="Add co-teacher"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto divide-y divide-border">
                  {/* Primary teacher — never removable */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">
                        {teachers.find((t) => t.id === openGroup.teacher_id)?.name ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">Teacher in charge</p>
                    </div>
                  </div>

                  {/* Co-teachers */}
                  {groupTeachers.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-6">
                      No co-teachers added yet
                    </p>
                  ) : (
                    groupTeachers.map((gt) => (
                      <div key={gt.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{gt.teachers?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">Co-teacher</p>
                        </div>
                        {isGroupManager && (
                          <button
                            type="button"
                            onClick={() => removeGroupTeacher(gt.id)}
                            className="p-1.5 rounded text-destructive hover:bg-destructive/10 transition-colors"
                            title="Remove co-teacher"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
