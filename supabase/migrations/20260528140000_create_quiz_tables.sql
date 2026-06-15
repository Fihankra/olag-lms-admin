-- Extend existing quizzes table with new columns
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scores_released boolean NOT NULL DEFAULT false;

-- Backfill teacher_id from created_by for existing rows
UPDATE public.quizzes SET teacher_id = created_by WHERE teacher_id IS NULL AND created_by IS NOT NULL;

-- Questions (relational, replaces the old JSON questions column)
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id       uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('multiple_choice','short_answer','long_answer')),
  marks         integer NOT NULL DEFAULT 1,
  order_index   integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- Answer options for multiple_choice questions
CREATE TABLE IF NOT EXISTS public.quiz_options (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct  boolean NOT NULL DEFAULT false
);

-- Accepted keywords for short_answer questions (any match = correct)
CREATE TABLE IF NOT EXISTS public.quiz_keywords (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  keyword     text NOT NULL
);

-- Specific student targets (used when class_id is null)
CREATE TABLE IF NOT EXISTS public.quiz_targets (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id    uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  UNIQUE(quiz_id, student_id)
);

-- One attempt per student per quiz
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id      uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  started_at   timestamptz DEFAULT now(),
  submitted_at timestamptz,
  total_score  numeric,
  UNIQUE(quiz_id, student_id)
);

-- Per-question response within an attempt
CREATE TABLE IF NOT EXISTS public.quiz_responses (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id         uuid NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id        uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  selected_option_id uuid REFERENCES public.quiz_options(id) ON DELETE SET NULL,
  text_answer        text,
  is_correct         boolean,
  marks_awarded      numeric,
  UNIQUE(attempt_id, question_id)
);
