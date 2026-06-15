-- Fix quiz_attempts / quiz_responses schema to match the student app model,
-- and update the SECURITY DEFINER RPCs so the app never needs a direct INSERT.
-- The anon role only has SELECT on these tables; all writes go through RPCs.

-- ── 1. quiz_attempts ─────────────────────────────────────────────────────────

-- The table was created via the Supabase dashboard with student_id referencing
-- auth.users instead of public.students. Fix the FK constraint first.
ALTER TABLE IF EXISTS public.quiz_attempts
  DROP CONSTRAINT IF EXISTS quiz_attempts_student_id_fkey;

ALTER TABLE IF EXISTS public.quiz_attempts
  ADD CONSTRAINT quiz_attempts_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

-- Create the table if it was never applied by the previous migration.
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id    uuid NOT NULL REFERENCES public.quizzes(id)  ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  start_time timestamptz DEFAULT now(),
  submitted_time timestamptz,
  auto_submitted boolean NOT NULL DEFAULT false,
  num_of_question integer NOT NULL DEFAULT 0,
  num_of_questions_answered integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(quiz_id, student_id)
);

-- If the table was created by the 20260528 migration it has started_at /
-- submitted_at instead of start_time / submitted_time. Rename them safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quiz_attempts'
      AND column_name = 'started_at'
  ) THEN
    ALTER TABLE public.quiz_attempts RENAME COLUMN started_at TO start_time;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quiz_attempts'
      AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE public.quiz_attempts RENAME COLUMN submitted_at TO submitted_time;
  END IF;
END $$;

-- Add any columns the table may still be missing.
ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS auto_submitted            boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS num_of_question           integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_of_questions_answered integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at                timestamptz          DEFAULT now();

-- ── 2. quiz_responses ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quiz_responses (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id  uuid NOT NULL REFERENCES public.quiz_attempts(id)  ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  student_id  uuid REFERENCES public.students(id) ON DELETE CASCADE,
  quiz_id     uuid REFERENCES public.quizzes(id)  ON DELETE CASCADE,
  answer      text,
  marks_attained integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(attempt_id, question_id)
);

-- Fix FK: student_id must reference public.students, not auth.users
ALTER TABLE IF EXISTS public.quiz_responses
  DROP CONSTRAINT IF EXISTS quiz_responses_student_id_fkey;

ALTER TABLE IF EXISTS public.quiz_responses
  ADD CONSTRAINT quiz_responses_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_responses
  ADD COLUMN IF NOT EXISTS student_id    uuid    REFERENCES public.students(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS quiz_id       uuid    REFERENCES public.quizzes(id)  ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS answer        text,
  ADD COLUMN IF NOT EXISTS marks_attained integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at    timestamptz      DEFAULT now();

-- The ON CONFLICT clause in upsert_quiz_response requires a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS quiz_responses_attempt_question_key
  ON public.quiz_responses (attempt_id, question_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.quiz_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;

-- anon (student app) — read-only; writes go through SECURITY DEFINER functions
DROP POLICY IF EXISTS "anon can read quiz_attempts"  ON public.quiz_attempts;
CREATE POLICY "anon can read quiz_attempts"
  ON public.quiz_attempts FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon can read quiz_responses" ON public.quiz_responses;
CREATE POLICY "anon can read quiz_responses"
  ON public.quiz_responses FOR SELECT TO anon USING (true);

-- authenticated (admin app) — full access
DROP POLICY IF EXISTS "Authenticated users can manage quiz_attempts"  ON public.quiz_attempts;
CREATE POLICY "Authenticated users can manage quiz_attempts"
  ON public.quiz_attempts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage quiz_responses" ON public.quiz_responses;
CREATE POLICY "Authenticated users can manage quiz_responses"
  ON public.quiz_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 4. open_quiz_attempt ─────────────────────────────────────────────────────
-- Now accepts _num_of_question and uses the corrected column names.

DROP FUNCTION IF EXISTS public.open_quiz_attempt(uuid, uuid);
DROP FUNCTION IF EXISTS public.open_quiz_attempt(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.open_quiz_attempt(
  _quiz_id          uuid,
  _student_id       uuid,
  _num_of_question  integer DEFAULT 0
)
RETURNS SETOF public.quiz_attempts
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.quiz_attempts (quiz_id, student_id, start_time, num_of_question)
  VALUES (_quiz_id, _student_id, now(), _num_of_question)
  ON CONFLICT (quiz_id, student_id) DO NOTHING;

  SELECT * FROM public.quiz_attempts
  WHERE quiz_id   = _quiz_id
    AND student_id = _student_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.open_quiz_attempt(uuid, uuid, integer) TO anon, authenticated;

-- ── 5. submit_quiz_attempt ───────────────────────────────────────────────────
-- Now accepts _auto_submitted and uses the corrected column names.

DROP FUNCTION IF EXISTS public.submit_quiz_attempt(uuid);
DROP FUNCTION IF EXISTS public.submit_quiz_attempt(uuid, boolean);

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(
  _attempt_id     uuid,
  _auto_submitted boolean DEFAULT false
)
RETURNS SETOF public.quiz_attempts
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.quiz_attempts
  SET
    submitted_time = now(),
    auto_submitted = _auto_submitted
  WHERE id = _attempt_id
    AND submitted_time IS NULL;

  SELECT * FROM public.quiz_attempts WHERE id = _attempt_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, boolean) TO anon, authenticated;

-- ── 6. upsert_quiz_response ──────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.upsert_quiz_response(uuid, uuid, uuid, uuid, text, integer);
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
  DO UPDATE SET
    answer         = EXCLUDED.answer,
    marks_attained = EXCLUDED.marks_attained;

  SELECT * FROM public.quiz_responses
  WHERE attempt_id  = _attempt_id
    AND question_id = _question_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_quiz_response(uuid, uuid, uuid, uuid, text, integer)
  TO anon, authenticated;
