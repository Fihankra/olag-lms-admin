/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/use-auth";
import {
  BookOpen,
  CheckCircle,
  ClipboardCheck,
  Clock,
  List,
  Pencil,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Users,
  X,
  XCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { toastResult } from "../../lib/supabase-toast";

export const Route = createFileRoute("/_authenticated/quizzes")({
  component: QuizzesPage,
  head: () => ({
    meta: [
      { title: "Quizzes — OLAG LMS" },
      { name: "description", content: "Manage quizzes and assessments" },
    ],
  }),
});

// ── Types ────────────────────────────────────────────────────────────────────

type QuestionType = "multiple_choice" | "short_answer" | "fill_in";

type Quiz = {
  id: string;
  title: string;
  subject: string;
  description: string | null;
  duration_minute: number;
  status: "draft" | "active" | "completed";
  scores_released: boolean;
  created_by: string | null;
  teacher_id: string | null;
  created_at: string;
  target_count?: number; // derived from quiz_targets
};

// quiz_options now stores arrays — one row per question
type QuizOption = {
  id: string;
  quiz_id: string;
  question_id: string;
  options: string[];
  correct_answers: string[];
};

type Question = {
  id: string;
  quiz_id: string;
  question: string;
  question_type: QuestionType;
  marks: number;
  created_at: string;
  quiz_options?: QuizOption | null; // single row joined from quiz_options
};

type QuizTarget = {
  id: string;
  quiz_id: string;
  target_student_ids: string[];
};

type Teacher = { id: string; name: string; user_id: string | null };
type ClassItem = { id: string; name: string };
type Student = { id: string; name: string; student_id: string; class_id: string | null };

type Attempt = {
  id: string;
  quiz_id: string;
  student_id: string;
  start_time: string;
  submitted_time: string | null;
  auto_submitted: boolean;
  num_of_question: number;
  num_of_questions_answered: number;
  created_at: string;
};

type Response = {
  id: string;
  student_id: string;
  quiz_id: string;
  question_id: string;
  attempt_id: string | null;
  answer: string | null;
  marks_attained: number;
};

type QuizForm = {
  title: string;
  subject: string;
  description: string;
  duration_minute: number;
  target: "class" | "students";
  class_id: string;
  student_ids: string[];
  teacher_id: string; // stores teacher.user_id
  status: "draft" | "active" | "completed";
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUBJECTS = [
  "Mathematics", "English", "Science", "Social Studies", "ICT",
  "Religious Studies", "French", "Physical Education", "Arts",
];

const emptyForm: QuizForm = {
  title: "",
  subject: "",
  description: "",
  duration_minute: 30,
  target: "class",
  class_id: "",
  student_ids: [],
  teacher_id: "",
  status: "draft",
};

function statusBadge(quiz: Quiz) {
  if (quiz.scores_released)
    return { label: "Released", cls: "bg-green-500/10 text-green-600 dark:text-green-400" };
  if (quiz.status === "active")
    return { label: "Active", cls: "bg-primary/10 text-primary" };
  if (quiz.status === "completed")
    return { label: "Completed", cls: "bg-orange-500/10 text-orange-600 dark:text-orange-400" };
  return { label: "Draft", cls: "bg-muted text-muted-foreground" };
}

function typeBadge(type: QuestionType) {
  if (type === "multiple_choice")
    return { label: "Multiple Choice", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" };
  if (type === "short_answer")
    return { label: "Short Answer", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  return { label: "Fill In", cls: "bg-purple-500/10 text-purple-600 dark:text-purple-400" };
}

function totalMarks(qs: Question[]) {
  return qs.reduce((s, q) => s + q.marks, 0);
}

// ── Page ─────────────────────────────────────────────────────────────────────

function QuizzesPage() {
  const { teacherRecord, role, user } = useAuth();
  const isAdmin = role === "admin";

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  // Create / edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [quizForm, setQuizForm] = useState<QuizForm>(emptyForm);
  const [studentSearch, setStudentSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");

  // Questions side panel
  const [questionsQuiz, setQuestionsQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  // editingQ uses local arrays for MC options and accepted answers
  const [editingQ, setEditingQ] = useState<Partial<Question> | null>(null);
  const [mcOptions, setMcOptions] = useState<string[]>([]);
  const [mcCorrectIdx, setMcCorrectIdx] = useState<number>(-1);
  const [answerKeywords, setAnswerKeywords] = useState<string[]>([]);
  const [optionInput, setOptionInput] = useState("");

  // Submissions side panel
  const [submissionsQuiz, setSubmissionsQuiz] = useState<Quiz | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [attemptScores, setAttemptScores] = useState<Record<string, number>>({});
  const [selectedAttempt, setSelectedAttempt] = useState<Attempt | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [subQuestions, setSubQuestions] = useState<Question[]>([]);
  const [marksEdits, setMarksEdits] = useState<Record<string, string>>({});

  // ── Data fetching ─────────────────────────────────────────────────────────

  async function fetchQuizzes() {
    let query = supabase
      .from("quizzes")
      .select("*, quiz_targets(target_student_ids)")
      .order("created_at", { ascending: false });
    if (role === "teacher" && user) {
      query = query.eq("created_by", user.id);
    }
    const { data } = await query;
    const processed = ((data as any[]) ?? []).map((q: any) => ({
      ...q,
      target_count: q.quiz_targets?.[0]?.target_student_ids?.length ?? 0,
    })) as Quiz[];
    setQuizzes(processed);
  }

  async function fetchLookups() {
    const [{ data: c }, { data: s }, { data: t }] = await Promise.all([
      supabase.from("classes").select("id, name").order("name"),
      supabase.from("students").select("id, name, student_id, class_id").order("name"),
      supabase.from("teachers").select("id, name, user_id").eq("approved", true).order("name"),
    ]);
    setClasses((c as ClassItem[]) ?? []);
    setStudents((s as Student[]) ?? []);
    setTeachers((t as Teacher[]) ?? []);
  }

  useEffect(() => {
    fetchQuizzes();
    fetchLookups();
  }, [teacherRecord, role]);

  // ── Quiz CRUD ─────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingQuiz(null);
    setQuizForm({ ...emptyForm, teacher_id: teacherRecord?.id ?? "" });
    setStudentSearch("");
    setClassFilter("");
    setShowModal(true);
  }

  async function openEdit(quiz: Quiz) {
    const { data: target } = await supabase
      .from("quiz_targets")
      .select("target_student_ids")
      .eq("quiz_id", quiz.id)
      .maybeSingle();
    const targetIds = (target as Pick<QuizTarget, "target_student_ids"> | null)?.target_student_ids ?? [];
    setStudentSearch("");
    setClassFilter("");
    setEditingQuiz(quiz);
    setQuizForm({
      title: quiz.title,
      subject: quiz.subject,
      description: quiz.description ?? "",
      duration_minute: quiz.duration_minute ?? 30,
      target: "students",
      class_id: "",
      student_ids: targetIds,
      teacher_id: quiz.teacher_id ?? "",
      status: quiz.status,
    });
    setShowModal(true);
  }

  async function saveQuiz() {
    if (!quizForm.title.trim()) return;

    // Resolve final student ID list — expand class to student IDs if needed
    let finalStudentIds: string[] = [];
    if (quizForm.target === "class" && quizForm.class_id) {
      finalStudentIds = students
        .filter((s) => s.class_id === quizForm.class_id)
        .map((s) => s.id);
    } else {
      finalStudentIds = quizForm.student_ids;
    }

    const payload: any = {
      title: quizForm.title.trim(),
      subject: quizForm.subject || "General",
      description: quizForm.description.trim() || null,
      duration_minute: quizForm.duration_minute,
      created_by: user?.id ?? null,
      teacher_id: quizForm.teacher_id || null,
      status: quizForm.status,
    };

    const upsertTargets = async (quizId: string) => {
      await supabase.from("quiz_targets").delete().eq("quiz_id", quizId);
      await supabase.from("quiz_targets").insert({
        quiz_id: quizId,
        target_student_ids: finalStudentIds,
      } as any);
    };

    if (editingQuiz) {
      const { error } = await supabase.from("quizzes").update(payload).eq("id", editingQuiz.id);
      if (!toastResult(error ?? null, "Quiz updated")) return;
      await upsertTargets(editingQuiz.id);
    } else {
      const { data: q, error } = await supabase.from("quizzes").insert(payload).select().single();
      if (!toastResult(error ?? null, "Quiz created") || !q) return;
      await upsertTargets((q as any).id);
    }

    setShowModal(false);
    fetchQuizzes();
  }

  async function deleteQuiz(id: string) {
    await supabase.from("quizzes").delete().eq("id", id);
    fetchQuizzes();
  }

  async function setQuizStatus(quiz: Quiz, status: Quiz["status"]) {
    const { error } = await supabase.from("quizzes").update({ status } as any).eq("id", quiz.id);
    const labels: Record<Quiz["status"], string> = {
      draft: "Quiz set to Draft",
      active: "Quiz set to Active",
      completed: "Quiz marked as Completed",
    };
    toastResult(error ?? null, labels[status]);
    if (!error) fetchQuizzes();
  }

  async function toggleScores(quiz: Quiz) {
    const next = !quiz.scores_released;
    const { error } = await supabase
      .from("quizzes")
      .update({ scores_released: next })
      .eq("id", quiz.id);
    toastResult(error ?? null, next ? "Scores released to students" : "Scores hidden");
    if (!error) fetchQuizzes();
  }

  // ── Questions ─────────────────────────────────────────────────────────────

  async function openQuestions(quiz: Quiz) {
    setQuestionsQuiz(quiz);
    setEditingQ(null);
    await refreshQuestions(quiz.id);
  }

  async function refreshQuestions(quizId: string) {
    const { data } = await supabase
      .from("quiz_questions")
      .select("*, quiz_options(*)")
      .eq("quiz_id", quizId)
      .order("created_at");
    // quiz_options is returned as an array; we always expect 0 or 1 rows per question
    const qs = ((data as any[]) ?? []).map((q: any) => ({
      ...q,
      quiz_options: q.quiz_options?.[0] ?? null,
    })) as Question[];
    setQuestions(qs);
  }

  function startNewQuestion() {
    setMcOptions([]);
    setMcCorrectIdx(-1);
    setAnswerKeywords([]);
    setOptionInput("");
    setEditingQ({
      question: "",
      question_type: "multiple_choice",
      marks: 1,
    });
  }

  function editQuestion(q: Question) {
    const opts = q.quiz_options;
    if (q.question_type === "multiple_choice") {
      const opts_list = opts?.options ?? [];
      const correct = opts?.correct_answers?.[0] ?? "";
      setMcOptions(opts_list);
      setMcCorrectIdx(correct ? opts_list.indexOf(correct) : -1);
      setAnswerKeywords([]);
    } else {
      setMcOptions([]);
      setMcCorrectIdx(-1);
      setAnswerKeywords(opts?.correct_answers ?? []);
    }
    setOptionInput("");
    setEditingQ({ ...q });
  }

  async function saveQuestion() {
    if (!editingQ || !questionsQuiz || !editingQ.question?.trim()) return;

    const qData = {
      quiz_id: questionsQuiz.id,
      question: editingQ.question!,
      question_type: editingQ.question_type!,
      marks: editingQ.marks ?? 1,
    };

    let qId: string;
    if (editingQ.id) {
      qId = editingQ.id;
      await supabase.from("quiz_questions").update(qData as any).eq("id", qId);
    } else {
      const { data: newQ, error } = await supabase
        .from("quiz_questions")
        .insert(qData as any)
        .select()
        .single();
      if (error || !newQ) return;
      qId = (newQ as any).id;
    }

    // Replace quiz_options row for this question
    await supabase.from("quiz_options").delete().eq("question_id", qId);

    if (editingQ.question_type === "multiple_choice" && mcOptions.length > 0) {
      await supabase.from("quiz_options").insert({
        quiz_id: questionsQuiz.id,
        question_id: qId,
        options: mcOptions,
        correct_answers: mcCorrectIdx >= 0 ? [mcOptions[mcCorrectIdx]] : [],
      } as any);
    } else if (
      (editingQ.question_type === "short_answer" || editingQ.question_type === "fill_in") &&
      answerKeywords.length > 0
    ) {
      await supabase.from("quiz_options").insert({
        quiz_id: questionsQuiz.id,
        question_id: qId,
        options: [],
        correct_answers: answerKeywords,
      } as any);
    }

    setEditingQ(null);
    refreshQuestions(questionsQuiz.id);
  }

  async function deleteQuestion(id: string) {
    if (!questionsQuiz) return;
    await supabase.from("quiz_questions").delete().eq("id", id);
    refreshQuestions(questionsQuiz.id);
  }

  async function addToBank(q: Question) {
    const { data: gq, error } = await supabase
      .from("game_questions")
      .insert({
        subject: questionsQuiz?.subject ?? "General",
        question_text: q.question,
        question_type: q.question_type === "fill_in" ? "short_answer" : q.question_type,
        difficulty: "medium",
        source: "teacher",
      } as any)
      .select("id")
      .single();

    if (error || !gq) { toastResult(error ?? null, ""); return; }
    const qid = (gq as any).id;
    const opts = q.quiz_options;

    if (q.question_type === "multiple_choice" && (opts?.options ?? []).length > 0) {
      await supabase.from("game_question_options").insert(
        (opts!.options).map((opt) => ({
          question_id: qid,
          option_text: opt,
          is_correct: opts!.correct_answers.includes(opt),
        })) as any,
      );
    }
    if ((q.question_type === "short_answer" || q.question_type === "fill_in") && (opts?.correct_answers ?? []).length > 0) {
      await supabase.from("game_question_keywords").insert(
        (opts!.correct_answers).map((kw) => ({ question_id: qid, keyword: kw })) as any,
      );
    }
    toastResult(null, "Added to Question Bank");
  }

  function addMcOption() {
    if (!optionInput.trim()) return;
    setMcOptions((prev) => [...prev, optionInput.trim()]);
    setOptionInput("");
  }

  function addAnswerKeyword() {
    if (!optionInput.trim()) return;
    setAnswerKeywords((prev) => [...prev, optionInput.trim()]);
    setOptionInput("");
  }

  // ── Submissions ───────────────────────────────────────────────────────────

  async function openSubmissions(quiz: Quiz) {
    setSubmissionsQuiz(quiz);
    setSelectedAttempt(null);
    setResponses([]);
    setMarksEdits({});

    const [{ data: atts }, { data: qs }] = await Promise.all([
      supabase
        .from("quiz_attempts")
        .select("*")
        .eq("quiz_id", quiz.id)
        .order("submitted_time"),
      supabase
        .from("quiz_questions")
        .select("*, quiz_options(*)")
        .eq("quiz_id", quiz.id)
        .order("created_at"),
    ]);

    const processedQs = ((qs as any[]) ?? []).map((q: any) => ({
      ...q,
      quiz_options: q.quiz_options?.[0] ?? null,
    })) as Question[];
    setSubQuestions(processedQs);

    const attemptList = (atts as unknown as Attempt[]) ?? [];
    setAttempts(attemptList);

    // Pre-fetch scores for all submitted attempts
    if (attemptList.length > 0) {
      const { data: allResp } = await supabase
        .from("quiz_responses")
        .select("attempt_id, marks_attained")
        .in("attempt_id", attemptList.map((a) => a.id));
      const scores: Record<string, number> = {};
      for (const r of (allResp as any[]) ?? []) {
        scores[r.attempt_id] = (scores[r.attempt_id] ?? 0) + (r.marks_attained ?? 0);
      }
      setAttemptScores(scores);
    }
  }

  async function openAttempt(attempt: Attempt) {
    setSelectedAttempt(attempt);
    setMarksEdits({});
    const { data } = await supabase
      .from("quiz_responses")
      .select("*")
      .eq("attempt_id", attempt.id);
    setResponses((data as unknown as Response[]) ?? []);
  }

  async function saveMarks(responseId: string, marks: number, attempt: Attempt) {
    const { error } = await supabase
      .from("quiz_responses")
      .update({ marks_attained: marks } as any)
      .eq("id", responseId);
    if (error) { toastResult(error, ""); return; }
    toastResult(null, "Marks saved");
    openAttempt(attempt);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Quizzes"
        description="Create and manage quizzes and assessments"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            New Quiz
          </button>
        }
      />

      {quizzes.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No quizzes yet</h2>
          <p className="text-sm text-muted-foreground">Create your first quiz to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quizzes.map((quiz) => {
            const badge = statusBadge(quiz);
            return (
              <div
                key={quiz.id}
                className="bg-card rounded-lg border border-border p-4 hover:border-primary/40 transition-colors group flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{quiz.title}</h3>
                    <p className="text-xs text-muted-foreground">{quiz.subject}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>

                {quiz.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{quiz.description}</p>
                )}

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {quiz.duration_minute} min
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {quiz.target_count ?? 0} student{(quiz.target_count ?? 0) !== 1 ? "s" : ""}
                  </span>
                  {isAdmin && quiz.teacher_id && (
                    <span>
                      by {teachers.find((t) => t.user_id === quiz.teacher_id)?.name ?? "—"}
                    </span>
                  )}
                </div>

                <div className="mt-auto grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={() => openEdit(quiz)}
                    className="px-2 py-1.5 text-xs rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center justify-center gap-1">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button type="button" onClick={() => openQuestions(quiz)}
                    className="px-2 py-1.5 text-xs rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center justify-center gap-1">
                    <List className="h-3 w-3" /> Questions
                  </button>
                  <button type="button" onClick={() => openSubmissions(quiz)}
                    className="px-2 py-1.5 text-xs rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center justify-center gap-1">
                    <ClipboardCheck className="h-3 w-3" /> Submissions
                  </button>
                  <select
                    value={quiz.status}
                    onChange={(e) => setQuizStatus(quiz, e.target.value as Quiz["status"])}
                    className={`col-span-1 px-2 py-1.5 text-xs rounded-md border-0 cursor-pointer transition-colors ${
                      quiz.status === "active"
                        ? "bg-primary/10 text-primary"
                        : quiz.status === "completed"
                        ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                    title="Change status"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                  <button type="button" onClick={() => toggleScores(quiz)}
                    className={`col-span-1 px-2 py-1.5 text-xs rounded-md flex items-center justify-center gap-1 transition-colors ${
                      quiz.scores_released ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                    title={quiz.scores_released ? "Hide scores" : "Release scores to students"}>
                    {quiz.scores_released ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                    Scores
                  </button>
                  <button type="button" onClick={() => deleteQuiz(quiz.id)}
                    className="col-span-1 px-2 py-1.5 text-xs rounded-md text-destructive hover:bg-destructive/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete quiz">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ───────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{editingQuiz ? "Edit Quiz" : "New Quiz"}</h2>
            <div className="space-y-3">
              <input
                placeholder="Quiz title"
                value={quizForm.title}
                onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <datalist id="subject-suggestions">
                    {SUBJECTS.map((s) => <option key={s} value={s} />)}
                  </datalist>
                  <input
                    list="subject-suggestions"
                    placeholder="Subject (e.g. Mathematics)"
                    value={quizForm.subject}
                    onChange={(e) => setQuizForm({ ...quizForm, subject: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                  />
                </div>
                <input
                  type="number" min={1} max={300}
                  value={quizForm.duration_minute}
                  onChange={(e) => setQuizForm({ ...quizForm, duration_minute: parseInt(e.target.value) || 30 })}
                  className="w-28 px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                  placeholder="Duration (min)"
                  title="Duration in minutes"
                />
              </div>
              <textarea
                placeholder="Description (optional)"
                value={quizForm.description}
                onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                rows={2}
              />
              {isAdmin && (
                <select
                  value={quizForm.teacher_id}
                  onChange={(e) => setQuizForm({ ...quizForm, teacher_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                >
                  <option value="">Assign to teacher…</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.user_id ?? t.id}>{t.name}</option>
                  ))}
                </select>
              )}

              {/* Target */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">Target</p>
                <div className="flex gap-2 mb-2">
                  {(["class", "students"] as const).map((t) => (
                    <button key={t} type="button"
                      onClick={() => setQuizForm({ ...quizForm, target: t })}
                      className={`flex-1 py-1.5 text-xs rounded-md border font-medium transition-colors ${
                        quizForm.target === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-input text-foreground"
                      }`}>
                      {t === "class" ? "Entire Class" : "Selected Students"}
                    </button>
                  ))}
                </div>

                {quizForm.target === "class" ? (
                  <select
                    value={quizForm.class_id}
                    onChange={(e) => setQuizForm({ ...quizForm, class_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                  >
                    <option value="">Select class…</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <div>
                    {/* Search + class filter */}
                    <div className="flex gap-2 mb-2">
                      <input
                        placeholder="Search student name or ID…"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-md bg-input border border-border text-foreground text-xs"
                      />
                      <select
                        value={classFilter}
                        onChange={(e) => setClassFilter(e.target.value)}
                        className="w-36 px-2 py-1.5 rounded-md bg-input border border-border text-foreground text-xs"
                      >
                        <option value="">All classes</option>
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    {classFilter && (() => {
                      const inClass = students.filter((s) => s.class_id === classFilter).map((s) => s.id);
                      const allSelected = inClass.length > 0 && inClass.every((id) => quizForm.student_ids.includes(id));
                      return (
                        <button type="button"
                          onClick={() => {
                            if (allSelected) {
                              setQuizForm({ ...quizForm, student_ids: quizForm.student_ids.filter((id) => !inClass.includes(id)) });
                            } else {
                              setQuizForm({ ...quizForm, student_ids: Array.from(new Set([...quizForm.student_ids, ...inClass])) });
                            }
                          }}
                          className="mb-2 text-xs text-primary hover:underline">
                          {allSelected ? "Deselect all from this class" : `Select all from ${classes.find((c) => c.id === classFilter)?.name ?? "class"}`}
                        </button>
                      );
                    })()}

                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{quizForm.student_ids.length} selected</span>
                      {quizForm.student_ids.length > 0 && (
                        <button type="button" onClick={() => setQuizForm({ ...quizForm, student_ids: [] })}
                          className="text-xs text-muted-foreground hover:text-destructive">
                          Clear all
                        </button>
                      )}
                    </div>

                    <div className="max-h-40 overflow-y-auto border border-border rounded-md divide-y divide-border">
                      {students
                        .filter((s) => {
                          const q = studentSearch.toLowerCase();
                          return (!q || s.name.toLowerCase().includes(q) || s.student_id.toLowerCase().includes(q))
                            && (!classFilter || s.class_id === classFilter);
                        })
                        .map((s) => (
                          <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/30">
                            <input type="checkbox"
                              checked={quizForm.student_ids.includes(s.id)}
                              onChange={(e) => setQuizForm({
                                ...quizForm,
                                student_ids: e.target.checked
                                  ? [...quizForm.student_ids, s.id]
                                  : quizForm.student_ids.filter((x) => x !== s.id),
                              })}
                            />
                            <span className="truncate">
                              {s.name} <span className="text-muted-foreground">({s.student_id})</span>
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Status */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">Status</p>
                <div className="flex gap-2">
                  {(["draft", "active", "completed"] as const).map((s) => (
                    <button key={s} type="button"
                      onClick={() => setQuizForm({ ...quizForm, status: s })}
                      className={`flex-1 py-1.5 text-xs rounded-md border font-medium capitalize transition-colors ${
                        quizForm.status === s
                          ? s === "active"
                            ? "border-primary bg-primary/10 text-primary"
                            : s === "completed"
                            ? "border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400"
                            : "border-border bg-muted text-foreground"
                          : "border-border bg-input text-muted-foreground hover:text-foreground"
                      }`}>
                      {s === "active" ? "Active" : s === "completed" ? "Completed" : "Draft"}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {quizForm.status === "active"
                    ? "Students can see and attempt this quiz"
                    : quizForm.status === "completed"
                    ? "Quiz is closed — no new attempts allowed"
                    : "Hidden from students"}
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button type="button" onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">
                Cancel
              </button>
              <button type="button" onClick={saveQuiz}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                {editingQuiz ? "Save Changes" : "Create Quiz"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Questions Panel ───────────────────────────────────────────────── */}
      {questionsQuiz && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-50">
          <div className="bg-card border-l border-border w-full max-w-xl h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="min-w-0">
                <h2 className="font-semibold truncate">{questionsQuiz.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {questions.length} question{questions.length !== 1 ? "s" : ""} · {totalMarks(questions)} total marks
                </p>
              </div>
              <button type="button" onClick={() => setQuestionsQuiz(null)}
                className="p-1.5 rounded hover:bg-muted ml-2 shrink-0" title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {questions.length === 0 && !editingQ && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No questions yet — add one below.
                </p>
              )}

              {questions.map((q, idx) => {
                const tb = typeBadge(q.question_type);
                const opts = q.quiz_options;
                return (
                  <div key={q.id} className="border border-border rounded-lg overflow-hidden">
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-muted/20">
                      <span className="text-xs font-medium text-muted-foreground mt-0.5 w-5 shrink-0">{idx + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{q.question}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tb.cls}`}>{tb.label}</span>
                          <span className="text-[10px] text-muted-foreground">{q.marks} mark{q.marks !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => addToBank(q)}
                          className="p-1.5 rounded hover:bg-green-500/10 text-muted-foreground hover:text-green-600 dark:hover:text-green-400"
                          title="Add to Question Bank">
                          <BookOpen className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => editQuestion(q)}
                          className="p-1.5 rounded hover:bg-muted" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => deleteQuestion(q.id)}
                          className="p-1.5 rounded text-destructive hover:bg-destructive/10" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* MC options preview */}
                    {q.question_type === "multiple_choice" && (opts?.options ?? []).length > 0 && (
                      <div className="px-8 py-2 space-y-1 border-t border-border">
                        {(opts!.options).map((opt, i) => (
                          <div key={i} className={`flex items-center gap-2 text-xs ${
                            opts!.correct_answers.includes(opt)
                              ? "text-green-600 dark:text-green-400 font-medium"
                              : "text-muted-foreground"
                          }`}>
                            {opts!.correct_answers.includes(opt)
                              ? <CheckCircle className="h-3 w-3 shrink-0" />
                              : <div className="h-3 w-3 rounded-full border border-muted-foreground/40 shrink-0" />}
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Short answer / fill-in accepted answers preview */}
                    {(q.question_type === "short_answer" || q.question_type === "fill_in") && (opts?.correct_answers ?? []).length > 0 && (
                      <div className="px-8 py-2 border-t border-border flex flex-wrap gap-1">
                        {(opts!.correct_answers).map((kw, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded">
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Question editor */}
              {editingQ && (
                <div className="border border-primary/40 rounded-lg p-4 space-y-3 bg-primary/5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{editingQ.id ? "Edit Question" : "New Question"}</p>
                    <button type="button" onClick={() => setEditingQ(null)} title="Cancel" className="p-1 rounded hover:bg-muted">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <textarea
                    placeholder="Question text…"
                    value={editingQ.question ?? ""}
                    onChange={(e) => setEditingQ({ ...editingQ, question: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm resize-none"
                    autoFocus
                  />

                  <div className="flex gap-2">
                    <select
                      value={editingQ.question_type ?? "multiple_choice"}
                      onChange={(e) => {
                        setEditingQ({ ...editingQ, question_type: e.target.value as QuestionType });
                        setMcOptions([]);
                        setMcCorrectIdx(-1);
                        setAnswerKeywords([]);
                        setOptionInput("");
                      }}
                      className="flex-1 px-2 py-1.5 rounded-md bg-input border border-border text-sm"
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="short_answer">Short Answer</option>
                      <option value="fill_in">Fill In</option>
                    </select>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Marks:</span>
                      <input type="number" min={1}
                        value={editingQ.marks ?? 1}
                        onChange={(e) => setEditingQ({ ...editingQ, marks: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-1.5 rounded-md bg-input border border-border text-sm text-center"
                      />
                    </div>
                  </div>

                  {/* Multiple choice options */}
                  {editingQ.question_type === "multiple_choice" && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        Options <span className="font-normal">(click the circle to mark correct)</span>
                      </p>
                      {mcOptions.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <button type="button"
                            onClick={() => setMcCorrectIdx(i)}
                            className={`h-4 w-4 rounded-full border-2 shrink-0 transition-colors ${
                              mcCorrectIdx === i ? "border-green-500 bg-green-500" : "border-muted-foreground/40"
                            }`}
                            title="Mark as correct"
                          />
                          <input
                            value={opt}
                            onChange={(e) => setMcOptions(mcOptions.map((o, j) => j === i ? e.target.value : o))}
                            className="flex-1 px-2 py-1 rounded bg-input border border-border text-sm"
                            placeholder={`Option ${i + 1}`}
                          />
                          <button type="button" title="Remove option"
                            onClick={() => {
                              const next = mcOptions.filter((_, j) => j !== i);
                              setMcOptions(next);
                              if (mcCorrectIdx === i) setMcCorrectIdx(-1);
                              else if (mcCorrectIdx > i) setMcCorrectIdx(mcCorrectIdx - 1);
                            }}
                            className="p-1 rounded text-destructive hover:bg-destructive/10">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input value={optionInput} onChange={(e) => setOptionInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMcOption(); } }}
                          placeholder="Add option… (Enter to add)"
                          className="flex-1 px-2 py-1 rounded bg-input border border-border text-sm"
                        />
                        <button type="button" onClick={addMcOption} className="px-2 py-1 rounded bg-primary text-primary-foreground">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Short answer / fill-in accepted answers */}
                  {(editingQ.question_type === "short_answer" || editingQ.question_type === "fill_in") && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        Accepted answers <span className="font-normal">(any match = correct)</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {answerKeywords.map((kw, i) => (
                          <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded text-xs">
                            {kw}
                            <button type="button" title="Remove"
                              onClick={() => setAnswerKeywords(answerKeywords.filter((_, j) => j !== i))}
                              className="hover:text-destructive">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={optionInput} onChange={(e) => setOptionInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAnswerKeyword(); } }}
                          placeholder="Add accepted answer… (Enter to add)"
                          className="flex-1 px-2 py-1 rounded bg-input border border-border text-sm"
                        />
                        <button type="button" onClick={addAnswerKeyword} className="px-2 py-1 rounded bg-primary text-primary-foreground">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setEditingQ(null)}
                      className="px-3 py-1.5 text-xs rounded-md bg-secondary text-secondary-foreground">
                      Cancel
                    </button>
                    <button type="button" onClick={saveQuestion}
                      className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                      Save Question
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!editingQ && (
              <div className="px-4 py-3 border-t border-border shrink-0">
                <button type="button" onClick={startNewQuestion}
                  className="w-full py-2 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2">
                  <Plus className="h-4 w-4" /> Add Question
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Submissions Panel ─────────────────────────────────────────────── */}
      {submissionsQuiz && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-50">
          <div className="bg-card border-l border-border w-full max-w-xl h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="min-w-0 flex-1">
                {selectedAttempt ? (
                  <>
                    <button type="button" onClick={() => setSelectedAttempt(null)}
                      className="text-xs text-muted-foreground hover:text-foreground mb-0.5 flex items-center gap-1">
                      ← All submissions
                    </button>
                    <h2 className="font-semibold">
                      {students.find((s) => s.id === selectedAttempt.student_id)?.name ?? selectedAttempt.student_id.slice(0, 8) + "…"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedAttempt.submitted_time
                        ? `Submitted ${new Date(selectedAttempt.submitted_time).toLocaleString()}`
                        : "In progress"}
                      {selectedAttempt.submitted_time && ` · ${responses.reduce((s, r) => s + r.marks_attained, 0)} / ${totalMarks(subQuestions)} marks`}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="font-semibold truncate">{submissionsQuiz.title}</h2>
                    <p className="text-xs text-muted-foreground">
                      {attempts.length} submission{attempts.length !== 1 ? "s" : ""}
                    </p>
                  </>
                )}
              </div>
              <button type="button" onClick={() => { setSubmissionsQuiz(null); setSelectedAttempt(null); }}
                className="p-1.5 rounded hover:bg-muted ml-2 shrink-0" title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!selectedAttempt ? (
                <div className="divide-y divide-border">
                  {attempts.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-8">No submissions yet</p>
                  )}
                  {attempts.map((a) => {
                    const student = students.find((s) => s.id === a.student_id);
                    const score = attemptScores[a.id];
                    return (
                      <button type="button" key={a.id} onClick={() => openAttempt(a)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 text-left transition-colors">
                        <div>
                          <p className="text-sm font-medium">{student?.name ?? a.student_id.slice(0, 8) + "…"}</p>
                          <p className="text-xs text-muted-foreground">{student?.student_id ?? ""}</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          {a.submitted_time ? (
                            <>
                              <p className="text-xs font-medium text-primary">
                                {score !== undefined ? `${score} / ${totalMarks(subQuestions)}` : "Pending marks"}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(a.submitted_time).toLocaleDateString()}
                              </p>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {a.num_of_questions_answered}/{a.num_of_question} answered
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {subQuestions.map((q, idx) => {
                    const resp = responses.find((r) => r.question_id === q.id);
                    const opts = q.quiz_options;
                    const tb = typeBadge(q.question_type);
                    const marksKey = q.id;
                    const marksVal = marksEdits[marksKey] ?? String(resp?.marks_attained ?? "");
                    const isCorrect = resp ? resp.marks_attained > 0 : false;

                    return (
                      <div key={q.id} className="border border-border rounded-lg overflow-hidden">
                        <div className="flex items-start gap-2 px-3 py-2.5 bg-muted/20">
                          <span className="text-xs font-medium text-muted-foreground mt-0.5 shrink-0">{idx + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{q.question}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tb.cls}`}>{tb.label}</span>
                              <span className="text-[10px] text-muted-foreground">{q.marks} mark{q.marks !== 1 ? "s" : ""}</span>
                            </div>
                          </div>
                          {resp && q.question_type !== "fill_in" && (
                            <span className="shrink-0 mt-0.5">
                              {isCorrect ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                            </span>
                          )}
                        </div>

                        <div className="px-3 py-2.5 space-y-1.5">
                          {!resp ? (
                            <p className="text-xs text-muted-foreground italic">No answer</p>
                          ) : q.question_type === "multiple_choice" ? (
                            <>
                              <p className="text-xs">
                                <span className="text-muted-foreground">Answered: </span>
                                <span className={isCorrect ? "text-green-600 dark:text-green-400 font-medium" : "text-destructive font-medium"}>
                                  {resp.answer || "—"}
                                </span>
                              </p>
                              {!isCorrect && opts?.correct_answers?.[0] && (
                                <p className="text-xs">
                                  <span className="text-muted-foreground">Correct: </span>
                                  <span className="text-green-600 dark:text-green-400">{opts.correct_answers[0]}</span>
                                </p>
                              )}
                            </>
                          ) : q.question_type === "short_answer" ? (
                            <>
                              <p className="text-xs">
                                <span className="text-muted-foreground">Answer: </span>
                                <span className={isCorrect ? "text-green-600 dark:text-green-400 font-medium" : "text-destructive font-medium"}>
                                  {resp.answer || "—"}
                                </span>
                              </p>
                              {(opts?.correct_answers ?? []).length > 0 && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] text-muted-foreground">Accepted:</span>
                                  {opts!.correct_answers.map((kw, i) => (
                                    <span key={i} className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded">
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            /* Fill in — manual marking */
                            <>
                              <div className="bg-muted/30 rounded p-2 text-sm whitespace-pre-wrap break-words min-h-[2rem]">
                                {resp.answer || <span className="text-muted-foreground italic">No answer written</span>}
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <span className="text-xs text-muted-foreground whitespace-nowrap">Marks (max {q.marks}):</span>
                                <input type="number" min={0} max={q.marks} step={0.5}
                                  value={marksVal}
                                  onChange={(e) => setMarksEdits({ ...marksEdits, [marksKey]: e.target.value })}
                                  className="w-20 px-2 py-1 rounded bg-input border border-border text-sm text-center"
                                />
                                <button type="button"
                                  onClick={() => saveMarks(resp.id, parseFloat(marksVal) || 0, selectedAttempt)}
                                  className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90">
                                  Save
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
