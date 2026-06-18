/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../integrations/supabase/client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../hooks/use-auth";
import {
  AlertCircle,
  Check,
  Copy,
  Gamepad2,
  RefreshCw,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { toastResult } from "../../lib/supabase-toast";

// New tables aren't in generated types yet — cast until types are regenerated
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/games")({
  component: GamesPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionStatus = "lobby" | "active" | "completed";

type GameSession = {
  id: string;
  pin: string;
  host_id: string;
  title: string | null;
  subject: string | null;
  difficulty: string | null;
  question_count: number;
  time_per_question_seconds: number;
  status: SessionStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  participant_count: number;
  assigned_count: number;
};

type Participant = {
  id: string;
  student_id: string;
  score: number;
  joined_at: string;
  student_name?: string;
  student_code?: string;
};

const STATUS_STYLES: Record<SessionStatus, string> = {
  lobby:     "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  active:    "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  completed: "bg-muted text-muted-foreground border-border",
};

function statusLabel(s: SessionStatus) {
  return s === "lobby" ? "Waiting" : s === "active" ? "Active" : "Completed";
}

// ── Page ──────────────────────────────────────────────────────────────────────

function GamesPage() {
  const { role } = useAuth();

  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Detail modal
  const [selected, setSelected] = useState<GameSession | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────────

  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const { data: rows } = await db
      .from("game_sessions")
      .select("*")
      .order("created_at", { ascending: false }) as any;

    if (!rows) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: pCounts } = await db
      .from("game_participants")
      .select("session_id") as any;

    const pMap = new Map<string, number>();
    for (const p of (pCounts ?? [])) {
      pMap.set(p.session_id, (pMap.get(p.session_id) ?? 0) + 1);
    }

    const { data: qCounts } = await db
      .from("game_session_questions")
      .select("session_id") as any;

    const qMap = new Map<string, number>();
    for (const q of (qCounts ?? [])) {
      qMap.set(q.session_id, (qMap.get(q.session_id) ?? 0) + 1);
    }

    setSessions(rows.map((r: any) => ({
      ...r,
      participant_count: pMap.get(r.id) ?? 0,
      assigned_count:    qMap.get(r.id) ?? 0,
    })));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // ── Participants ──────────────────────────────────────────────────────────

  async function fetchParticipants(sessionId: string) {
    setLoadingParticipants(true);

    const { data } = await db
      .from("game_participants")
      .select("id, student_id, score, joined_at")
      .eq("session_id", sessionId)
      .order("score", { ascending: false });

    if (!data) { setLoadingParticipants(false); return; }

    const ids = (data as any[]).map((p) => p.student_id);
    const names: Record<string, { name: string; student_id: string }> = {};

    if (ids.length) {
      const { data: students } = await supabase
        .from("students")
        .select("id, name, student_id")
        .in("id", ids) as any;

      for (const s of (students ?? [])) {
        names[s.id] = { name: s.name, student_id: s.student_id };
      }
    }

    setParticipants((data as any[]).map((p) => ({
      id:           p.id,
      student_id:   p.student_id,
      score:        p.score,
      joined_at:    p.joined_at,
      student_name: names[p.student_id]?.name,
      student_code: names[p.student_id]?.student_id,
    })));
    setLoadingParticipants(false);
  }

  function openDetail(session: GameSession) {
    setSelected(session);
    fetchParticipants(session.id);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function deleteSession(id: string) {
    const { error } = await db.from("game_sessions").delete().eq("id", id);
    toastResult(error ?? null, "Session deleted");
    if (!error) {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (selected?.id === id) setSelected(null);
    }
  }

  // ── Copy PIN ──────────────────────────────────────────────────────────────

  function copyPin(pin: string) {
    navigator.clipboard.writeText(pin).then(() => {
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const activeSessions = sessions.filter((s) => s.status === "active").length;
  const completedSessions = sessions.filter((s) => s.status === "completed").length;
  const totalParticipants = sessions.reduce((sum, s) => sum + s.participant_count, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Game Sessions"
        description={
          sessions.length === 0
            ? "No sessions yet — students create sessions from the student app"
            : `${sessions.length} session${sessions.length !== 1 ? "s" : ""} · ${activeSessions} active · ${completedSessions} completed · ${totalParticipants} total participants`
        }
        actions={
          <button
            type="button"
            onClick={() => fetchSessions(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {/* Summary cards */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active Now",    value: activeSessions,    colour: "text-green-600 dark:text-green-400" },
            { label: "Completed",     value: completedSessions, colour: "text-foreground" },
            { label: "Total Players", value: totalParticipants, colour: "text-foreground" },
          ].map(({ label, value, colour }) => (
            <div key={label} className="bg-card border border-border rounded-lg px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${colour}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sessions table */}
      {loading ? (
        <div className="bg-card rounded-lg border border-border p-12 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center text-center">
          <Gamepad2 className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">No game sessions yet</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Students create game sessions from the student app by choosing a subject and difficulty.
            Sessions and results will appear here once games start.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-24">PIN</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Subject / Difficulty</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-20">Status</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-28">Players</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-32">Started</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-28">Created</th>
                <th className="w-10"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessions.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-muted/20 transition-colors group cursor-pointer"
                  onClick={() => openDetail(s)}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-mono font-bold text-sm tracking-widest text-primary">{s.pin}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-sm font-medium">{s.subject ?? "—"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{s.difficulty ?? "Any difficulty"}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${STATUS_STYLES[s.status]}`}>
                      {statusLabel(s.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1 text-sm">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {s.participant_count}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {s.started_at
                      ? new Date(s.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-destructive hover:bg-destructive/10 transition-opacity"
                      title="Delete session"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Session Detail Modal ──────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg border border-border w-full max-w-xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-bold text-2xl tracking-widest text-primary">{selected.pin}</span>
                  <button
                    type="button"
                    onClick={() => copyPin(selected.pin)}
                    title="Copy PIN"
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                  >
                    {pinCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${STATUS_STYLES[selected.status]}`}>
                    {statusLabel(selected.status)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground capitalize">
                  {selected.subject ?? "All subjects"}{selected.difficulty ? ` · ${selected.difficulty}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="p-1.5 rounded hover:bg-muted shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 divide-x divide-border border-b border-border shrink-0">
              {[
                { label: "Questions",   value: String(selected.question_count) },
                { label: "Players",     value: String(selected.participant_count) },
                { label: "Time / Q",    value: `${selected.time_per_question_seconds}s` },
                { label: "Duration",    value: selected.started_at && selected.ended_at
                    ? `${Math.round((new Date(selected.ended_at).getTime() - new Date(selected.started_at).getTime()) / 60000)} min`
                    : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium mt-0.5 truncate">{value}</p>
                </div>
              ))}
            </div>

            {/* Refresh */}
            <div className="flex items-center justify-end px-5 py-2 border-b border-border shrink-0">
              <button
                type="button"
                onClick={() => fetchParticipants(selected.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh leaderboard
              </button>
            </div>

            {/* Leaderboard */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Leaderboard</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {participants.length} player{participants.length !== 1 ? "s" : ""}
                </span>
              </div>

              {loadingParticipants ? (
                <div className="flex items-center justify-center py-10">
                  <span className="text-sm text-muted-foreground">Loading…</span>
                </div>
              ) : participants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                  <Users className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {selected.status === "lobby"
                      ? "Waiting for students to join…"
                      : "No participants recorded for this session."}
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/30">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-10">Rank</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Student</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-20">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {participants.map((p, idx) => (
                      <tr key={p.id} className={idx === 0 ? "bg-amber-500/5" : ""}>
                        <td className="px-4 py-2.5 text-sm font-medium text-muted-foreground">
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="text-sm font-medium">{p.student_name ?? "Unknown"}</p>
                          {p.student_code && <p className="text-xs text-muted-foreground">{p.student_code}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-sm font-bold">{p.score}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
              <button
                type="button"
                onClick={() => deleteSession(selected.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Session
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-4 py-1.5 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
