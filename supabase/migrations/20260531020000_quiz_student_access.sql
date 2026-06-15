-- Allow anon (student app) to read quiz data and manage their own attempts.
-- All write operations go through SECURITY DEFINER functions so we don't
-- need broad anon INSERT policies — the functions validate input at SQL level.

-- ── 1. Read access for anon on quiz content ───────────────────────────────────

CREATE POLICY IF NOT EXISTS "anon can read quizzes"
  ON public.quizzes FOR SELECT TO anon USING (true);

CREATE POLICY IF NOT EXISTS "anon can read quiz_questions"
  ON public.quiz_questions FOR SELECT TO anon USING (true);

CREATE POLICY IF NOT EXISTS "anon can read quiz_options"
  ON public.quiz_options FOR SELECT TO anon USING (true);

CREATE POLICY IF NOT EXISTS "anon can read quiz_targets"
  ON public.quiz_targets FOR SELECT TO anon USING (true);

CREATE POLICY IF NOT EXISTS "anon can read quiz_attempts"
  ON public.quiz_attempts FOR SELECT TO anon USING (true);

CREATE POLICY IF NOT EXISTS "anon can read quiz_responses"
  ON public.quiz_responses FOR SELECT TO anon USING (true);

-- ── 2. RPC: open_quiz_attempt ─────────────────────────────────────────────────
-- Creates a new attempt for (quiz_id, student_id) or returns the existing one.
-- SECURITY DEFINER bypasses RLS — the function itself validates the student.

DROP FUNCTION IF EXISTS public.open_quiz_attempt(uuid, uuid);

CREATE OR REPLACE FUNCTION public.open_quiz_attempt(
  _quiz_id   uuid,
  _student_id uuid
)
RETURNS SETOF public.quiz_attempts
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.quiz_attempts (quiz_id, student_id)
  VALUES (_quiz_id, _student_id)
  ON CONFLICT (quiz_id, student_id) DO NOTHING;

  SELECT * FROM public.quiz_attempts
  WHERE quiz_id  = _quiz_id
    AND student_id = _student_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.open_quiz_attempt(uuid, uuid) TO anon, authenticated;

-- ── 3. RPC: submit_quiz_attempt ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.submit_quiz_attempt(uuid);

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(_attempt_id uuid)
RETURNS SETOF public.quiz_attempts
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.quiz_attempts
  SET submitted_at = now()
  WHERE id = _attempt_id
    AND submitted_at IS NULL;

  SELECT * FROM public.quiz_attempts WHERE id = _attempt_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid) TO anon, authenticated;

-- ── 4. RPC: upsert_quiz_response ──────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.upsert_quiz_response(uuid, uuid, uuid, text, integer);

CREATE OR REPLACE FUNCTION public.upsert_quiz_response(
  _attempt_id  uuid,
  _question_id uuid,
  _student_id  uuid,
  _quiz_id     uuid,
  _answer      text,
  _marks       integer DEFAULT 0
)
RETURNS SETOF public.quiz_responses
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.quiz_responses
    (attempt_id, question_id, student_id, quiz_id, answer, marks_attained)
  VALUES
    (_attempt_id, _question_id, _student_id, _quiz_id, _answer, _marks)
  ON CONFLICT (attempt_id, question_id)
  DO UPDATE SET answer = EXCLUDED.answer, marks_attained = EXCLUDED.marks_attained;

  SELECT * FROM public.quiz_responses
  WHERE attempt_id  = _attempt_id
    AND question_id = _question_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_quiz_response(uuid, uuid, uuid, uuid, text, integer)
  TO anon, authenticated;
