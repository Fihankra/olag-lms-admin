/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/use-auth";
import {
  BookOpen,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileJson,
  Search,
  Trash2,
  X,
  Upload,
  AlertCircle,
  Calendar,
  Tag,
  User,
} from "lucide-react";
import { toastResult } from "../../lib/supabase-toast";

export const Route = createFileRoute("/_authenticated/question-bank")({
  component: QuestionBankPage,
  head: () => ({
    meta: [
      { title: "Question Bank — OLAG LMS" },
      { name: "description", content: "Manage quiz game questions" },
    ],
  }),
});

// ── Types ─────────────────────────────────────────────────────────────────────

type Difficulty = "easy" | "medium" | "hard";
type QuestionType = "multiple_choice" | "short_answer";

type GameQuestion = {
  id: string;
  subject: string;
  question_text: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  source: string;
  options: string[];          // MC: list of option texts;  SA: []
  correct_answers: string[];  // MC: the correct option text(s); SA: accepted keywords
  created_at: string;
};

type SubjectStat = { subject: string; count: number };

// JSON import formats:
// MC:  { subject, question, type:"mcq"|"multiple_choice", difficulty?, options:string[], answer:"correct text" }
//   OR { subject, question, type:"mcq"|"multiple_choice", difficulty?, options:[{text,correct},...] }
// SA:  { subject, question, type:"short_answer"|"sa", difficulty?, keywords:string[] }

type ImportRow = {
  subject?: string;
  category?: string;
  question?: string;
  question_text?: string;
  type?: string;
  difficulty?: string;
  options?: (string | { text: string; correct?: boolean })[];
  answer?: number | string;
  correct?: number | string;
  keywords?: string[];
  answers?: string[];
};

const PAGE_SIZE = 50;
const BATCH_SIZE = 100;
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function diffBadge(d: Difficulty) {
  if (d === "easy") return "bg-green-500/10 text-green-600 dark:text-green-400";
  if (d === "hard") return "bg-red-500/10 text-red-600 dark:text-red-400";
  return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
}

// ── Page ──────────────────────────────────────────────────────────────────────

function QuestionBankPage() {
  const { role } = useAuth();

  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<SubjectStat[]>([]);
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");

  // Detail dialog — no async needed, arrays are already on the question row
  const [selectedQuestion, setSelectedQuestion] = useState<GameQuestion | null>(null);

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFile, setImportFile] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const subjects = stats.map((s) => s.subject).sort();

  // ── Data ────────────────────────────────────────────────────────────────────

  async function fetchStats() {
    const { data } = await supabase.from("game_questions").select("subject").order("subject");
    if (!data) return;
    const counts: Record<string, number> = {};
    for (const row of data as any[]) {
      counts[row.subject] = (counts[row.subject] ?? 0) + 1;
    }
    setStats(Object.entries(counts).map(([subject, count]) => ({ subject, count })));
  }

  async function fetchQuestions(p = page) {
    let query = supabase
      .from("game_questions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE - 1);

    if (search.trim()) query = query.ilike("question_text", `%${search.trim()}%`);
    if (filterSubject) query = query.eq("subject", filterSubject);
    if (filterType) query = query.eq("question_type", filterType);
    if (filterDifficulty) query = query.eq("difficulty", filterDifficulty);

    const { data, count } = await query;
    setQuestions((data as GameQuestion[]) ?? []);
    if (count !== null) setTotal(count);
  }

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    setPage(0);
    fetchQuestions(0);
  }, [search, filterSubject, filterType, filterDifficulty]);

  useEffect(() => {
    fetchQuestions(page);
  }, [page]);

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function deleteQuestion(id: string) {
    const { error } = await supabase.from("game_questions").delete().eq("id", id);
    toastResult(error ?? null, "Question deleted");
    if (!error) {
      fetchQuestions();
      fetchStats();
    }
  }

  // ── JSON Import ──────────────────────────────────────────────────────────────

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file.name);
    setImportErrors([]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const rows: ImportRow[] = Array.isArray(parsed) ? parsed : [parsed];
        setImportRows(rows);
      } catch {
        setImportErrors(["Invalid JSON file — could not parse."]);
        setImportRows([]);
      }
    };
    reader.readAsText(file);
  }

  function parseRow(row: ImportRow): Omit<GameQuestion, "id" | "created_at"> | null {
    const subject = (row.subject ?? row.category ?? "").trim();
    const question_text = (row.question ?? row.question_text ?? "").trim();
    const rawType = (row.type ?? "").toLowerCase();
    const question_type: QuestionType =
      rawType === "mcq" || rawType === "multiple_choice" ? "multiple_choice" : "short_answer";
    const difficulty: Difficulty = DIFFICULTIES.includes(row.difficulty as Difficulty)
      ? (row.difficulty as Difficulty)
      : "medium";

    if (!subject || !question_text) return null;

    if (question_type === "multiple_choice") {
      const rawOptions = row.options ?? [];
      const answerText =
        typeof row.answer === "string"
          ? row.answer.trim().toLowerCase()
          : typeof row.correct === "string"
            ? (row.correct as string).trim().toLowerCase()
            : null;
      const correctIdx =
        answerText === null
          ? typeof row.answer === "number"
            ? row.answer
            : typeof row.correct === "number"
              ? row.correct
              : -1
          : -1;

      const options: string[] = [];
      const correct_answers: string[] = [];

      for (let i = 0; i < rawOptions.length; i++) {
        const opt = rawOptions[i];
        if (typeof opt === "string") {
          options.push(opt);
          const isCorrect = answerText ? opt.trim().toLowerCase() === answerText : i === correctIdx;
          if (isCorrect) correct_answers.push(opt);
        } else if (opt && typeof opt === "object") {
          options.push(opt.text ?? "");
          if (opt.correct) correct_answers.push(opt.text ?? "");
        }
      }

      if (options.length === 0) return null;
      return { subject, question_text, question_type, difficulty, source: "admin", options, correct_answers };
    } else {
      const kws = row.keywords ?? row.answers ?? [];
      const correct_answers = kws.map((k: string) => k.trim()).filter(Boolean);
      if (correct_answers.length === 0) return null;
      return { subject, question_text, question_type, difficulty, source: "admin", options: [], correct_answers };
    }
  }

  async function runImport() {
    if (!importRows.length) return;
    setImporting(true);
    setImportProgress(0);

    const parsed = importRows.map(parseRow);
    const valid = parsed.filter(Boolean) as NonNullable<ReturnType<typeof parseRow>>[];
    const skipped = parsed.length - valid.length;

    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);
      const { error: qErr } = await supabase.from("game_questions").insert(batch as any);
      if (qErr) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${qErr.message}`);
      } else {
        inserted += batch.length;
      }
      setImportProgress(Math.round(((i + BATCH_SIZE) / valid.length) * 100));
    }

    setImporting(false);
    if (errors.length) {
      setImportErrors(errors);
    } else {
      const msg = `Imported ${inserted} question${inserted !== 1 ? "s" : ""}${skipped ? ` (${skipped} skipped — missing fields)` : ""}.`;
      toastResult(null, msg);
      setShowImport(false);
      setImportRows([]);
      setImportFile("");
      fetchQuestions(0);
      fetchStats();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Question Bank"
        description={`${total.toLocaleString()} question${total !== 1 ? "s" : ""} across ${stats.length} subject${stats.length !== 1 ? "s" : ""}`}
        actions={
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <FileJson className="h-4 w-4" />
            Import JSON
          </button>
        }
      />

      {/* Subject stats */}
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stats.map((s) => (
            <button
              key={s.subject}
              type="button"
              onClick={() => setFilterSubject(filterSubject === s.subject ? "" : s.subject)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                filterSubject === s.subject
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {s.subject} · {s.count.toLocaleString()}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            placeholder="Search questions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
        >
          <option value="">All types</option>
          <option value="multiple_choice">Multiple Choice</option>
          <option value="short_answer">Short Answer</option>
        </select>
        <select
          value={filterDifficulty}
          onChange={(e) => setFilterDifficulty(e.target.value)}
          className="px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
        >
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        {(search || filterSubject || filterType || filterDifficulty) && (
          <button
            type="button"
            onClick={() => { setSearch(""); setFilterSubject(""); setFilterType(""); setFilterDifficulty(""); }}
            className="px-3 py-2 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Question table */}
      {questions.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">No questions found</p>
          <p className="text-xs text-muted-foreground">
            Import a JSON file or add questions from the Quizzes page.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-8">#</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-32">Subject</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Question</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-28">Type</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-20">Difficulty</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-20">Source</th>
                <th className="w-10"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {questions.map((q, idx) => (
                <tr
                  key={q.id}
                  className="hover:bg-muted/20 transition-colors group cursor-pointer"
                  onClick={() => setSelectedQuestion(q)}
                >
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{page * PAGE_SIZE + idx + 1}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-medium truncate block max-w-[7rem]">{q.subject}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-sm line-clamp-2">{q.question_text}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      q.question_type === "multiple_choice"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}>
                      {q.question_type === "multiple_choice" ? "MC" : "Short"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${diffBadge(q.difficulty)}`}>
                      {q.difficulty}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-[10px] text-muted-foreground capitalize">{q.source}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedQuestion(q); }}
                        title="View details"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteQuestion(q.id); }}
                        title="Delete question"
                        className="p-1 rounded text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  const pg =
                    totalPages <= 7 ? i
                    : page < 4 ? i
                    : page > totalPages - 5 ? totalPages - 7 + i
                    : page - 3 + i;
                  return (
                    <button
                      key={pg}
                      type="button"
                      onClick={() => setPage(pg)}
                      className={`w-7 h-7 text-xs rounded transition-colors ${
                        pg === page ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
                      }`}
                    >
                      {pg + 1}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Question Detail Dialog ────────────────────────────────────────── */}
      {selectedQuestion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg border border-border w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex flex-wrap items-center gap-1.5 pr-4">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  selectedQuestion.question_type === "multiple_choice"
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}>
                  {selectedQuestion.question_type === "multiple_choice" ? "Multiple Choice" : "Short Answer"}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${diffBadge(selectedQuestion.difficulty)}`}>
                  {selectedQuestion.difficulty}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQuestion(null)}
                className="p-1.5 rounded hover:bg-muted shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <p className="text-base font-medium leading-relaxed">{selectedQuestion.question_text}</p>

              {/* Meta */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3" /> {selectedQuestion.subject}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" /> Source: <span className="capitalize ml-0.5">{selectedQuestion.source}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(selectedQuestion.created_at).toLocaleDateString(undefined, {
                    year: "numeric", month: "short", day: "numeric",
                  })}
                </span>
              </div>

              {/* MC options */}
              {selectedQuestion.question_type === "multiple_choice" && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Answer Options
                  </p>
                  {selectedQuestion.options.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No options stored</p>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedQuestion.options.map((opt, idx) => {
                        const isCorrect = selectedQuestion.correct_answers.includes(opt);
                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm ${
                              isCorrect
                                ? "bg-green-500/10 border border-green-500/20"
                                : "bg-muted/30 border border-border"
                            }`}
                          >
                            <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                              isCorrect ? "border-green-500 bg-green-500" : "border-muted-foreground/40"
                            }`}>
                              {isCorrect && (
                                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                                  <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                            <span className={isCorrect ? "font-medium text-green-700 dark:text-green-400" : "text-foreground"}>
                              {opt}
                            </span>
                            {isCorrect && (
                              <span className="ml-auto text-[10px] font-medium text-green-600 dark:text-green-400">
                                Correct
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SA keywords */}
              {selectedQuestion.question_type === "short_answer" && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Accepted Answers
                  </p>
                  {selectedQuestion.correct_answers.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No answers stored</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedQuestion.correct_answers.map((kw, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium border border-amber-500/20"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
              <button
                type="button"
                onClick={() => { deleteQuestion(selectedQuestion.id); setSelectedQuestion(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Question
              </button>
              <button
                type="button"
                onClick={() => setSelectedQuestion(null)}
                className="px-4 py-1.5 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── JSON Import Modal ──────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Import Questions from JSON</h2>
              <button
                type="button"
                onClick={() => { setShowImport(false); setImportRows([]); setImportFile(""); setImportErrors([]); }}
                className="p-1.5 rounded hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="bg-muted/40 rounded-md p-3 mb-4 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground mb-1">Expected JSON format:</p>
              <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed">{`[
  {
    "subject": "Mathematics",
    "question": "What is 5 × 6?",
    "type": "mcq",
    "difficulty": "easy",
    "options": ["25", "30", "35", "40"],
    "answer": "30"
  },
  {
    "subject": "Science",
    "question": "What is H₂O commonly known as?",
    "type": "short_answer",
    "difficulty": "medium",
    "keywords": ["water", "Water"]
  }
]`}</pre>
              <p className="mt-1">
                <span className="font-medium">type</span>: <code>mcq</code> or <code>short_answer</code> &nbsp;|&nbsp;{" "}
                <span className="font-medium">answer</span>: exact text of the correct option &nbsp;|&nbsp;{" "}
                <span className="font-medium">difficulty</span>: easy / medium / hard (optional, defaults to medium)
              </p>
            </div>

            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full py-6 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-muted/20 transition-colors cursor-pointer mb-3"
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{importFile || "Click to select a .json file"}</span>
            </button>

            {importRows.length > 0 && (
              <div className="mb-3 flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <span>
                  <span className="font-medium">{importRows.length.toLocaleString()}</span> question
                  {importRows.length !== 1 ? "s" : ""} ready to import
                </span>
              </div>
            )}

            {importErrors.length > 0 && (
              <div className="mb-3 p-3 rounded-md bg-destructive/10 border border-destructive/20 space-y-1">
                {importErrors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">{e}</p>
                ))}
              </div>
            )}

            {importing && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Importing…</span><span>{importProgress}%</span>
                </div>
                <progress
                  value={importProgress}
                  max={100}
                  className="w-full h-1.5 rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary"
                />
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowImport(false); setImportRows([]); setImportFile(""); setImportErrors([]); }}
                className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runImport}
                disabled={importRows.length === 0 || importing}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {importing ? "Importing…" : `Import ${importRows.length.toLocaleString()} Questions`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
