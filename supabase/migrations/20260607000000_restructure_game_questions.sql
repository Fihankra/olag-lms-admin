-- Restructure game questions to match quiz pattern:
-- options text[] + correct_answers text[] on the question row itself.
-- Drop the separate game_question_options / game_question_keywords tables.
-- Add multiplayer game session tables.
-- Safe to re-run: all CREATE/ALTER use IF NOT EXISTS / IF EXISTS guards.

-- ── 1. Ensure game_questions exists with the new columns ──────────────────────
-- Creates the table if it never existed, otherwise ADD COLUMN IF NOT EXISTS
-- is a no-op on an existing table that already has the columns.

CREATE TABLE IF NOT EXISTS public.game_questions (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  subject         text        NOT NULL,
  question_text   text        NOT NULL,
  question_type   text        NOT NULL
                              CHECK (question_type IN ('multiple_choice', 'short_answer')),
  difficulty      text        NOT NULL DEFAULT 'medium'
                              CHECK (difficulty IN ('easy', 'medium', 'hard')),
  source          text        NOT NULL DEFAULT 'admin'
                              CHECK (source IN ('admin', 'teacher')),
  options         text[]      NOT NULL DEFAULT '{}',
  correct_answers text[]      NOT NULL DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.game_questions
  ADD COLUMN IF NOT EXISTS options         text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS correct_answers text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_game_questions_subject ON public.game_questions(subject);
CREATE INDEX IF NOT EXISTS idx_game_questions_type    ON public.game_questions(question_type);

-- ── 2. Migrate data from old child tables (skipped if tables don't exist) ─────

DO $$
BEGIN
  -- Migrate MC questions: pull option texts + correct option text into arrays
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'game_question_options'
  ) THEN
    UPDATE public.game_questions gq
    SET
      options = COALESCE(
        (SELECT array_agg(gqo.option_text ORDER BY gqo.id)
         FROM public.game_question_options gqo
         WHERE gqo.question_id = gq.id),
        '{}'
      ),
      correct_answers = COALESCE(
        (SELECT array_agg(gqo.option_text ORDER BY gqo.id)
         FROM public.game_question_options gqo
         WHERE gqo.question_id = gq.id AND gqo.is_correct = true),
        '{}'
      )
    WHERE gq.question_type = 'multiple_choice';

    DROP TABLE public.game_question_options CASCADE;
  END IF;

  -- Migrate short_answer questions: pull keywords into correct_answers array
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'game_question_keywords'
  ) THEN
    UPDATE public.game_questions gq
    SET correct_answers = COALESCE(
      (SELECT array_agg(gqk.keyword ORDER BY gqk.id)
       FROM public.game_question_keywords gqk
       WHERE gqk.question_id = gq.id),
      '{}'
    )
    WHERE gq.question_type = 'short_answer';

    DROP TABLE public.game_question_keywords CASCADE;
  END IF;
END $$;

-- ── 3. student_seen_questions (no-repeat per student) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.student_seen_questions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id  uuid        NOT NULL REFERENCES public.students(id)        ON DELETE CASCADE,
  question_id uuid        NOT NULL REFERENCES public.game_questions(id)  ON DELETE CASCADE,
  seen_at     timestamptz DEFAULT now(),
  UNIQUE(student_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_student_seen_student  ON public.student_seen_questions(student_id);
CREATE INDEX IF NOT EXISTS idx_student_seen_question ON public.student_seen_questions(question_id);

-- ── 4. Multiplayer: game_sessions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id                        uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  pin                       text        NOT NULL UNIQUE,
  host_id                   uuid        NOT NULL,
  title                     text,
  subject                   text,
  difficulty                text        CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question_count            int         NOT NULL DEFAULT 10,
  time_per_question_seconds int         NOT NULL DEFAULT 30,
  status                    text        NOT NULL DEFAULT 'lobby'
                                        CHECK (status IN ('lobby', 'active', 'completed')),
  started_at                timestamptz,
  ended_at                  timestamptz,
  created_at                timestamptz DEFAULT now()
);

-- ── 5. Participants ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_participants (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid        NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  student_id uuid        NOT NULL REFERENCES public.students(id)      ON DELETE CASCADE,
  score      int         NOT NULL DEFAULT 0,
  joined_at  timestamptz DEFAULT now(),
  UNIQUE(session_id, student_id)
);

-- ── 6. Questions assigned to a session ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_session_questions (
  session_id  uuid NOT NULL REFERENCES public.game_sessions(id)      ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.game_questions(id)     ON DELETE CASCADE,
  position    int  NOT NULL,
  PRIMARY KEY(session_id, question_id)
);

-- ── 7. Student answers ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_responses (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id    uuid        NOT NULL REFERENCES public.game_sessions(id)  ON DELETE CASCADE,
  student_id    uuid        NOT NULL REFERENCES public.students(id)        ON DELETE CASCADE,
  question_id   uuid        NOT NULL REFERENCES public.game_questions(id) ON DELETE CASCADE,
  answer        text,
  is_correct    boolean,
  points_earned int         NOT NULL DEFAULT 0,
  answered_at   timestamptz DEFAULT now(),
  UNIQUE(session_id, student_id, question_id)
);

-- ── 8. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_game_sessions_status      ON public.game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_pin         ON public.game_sessions(pin);
CREATE INDEX IF NOT EXISTS idx_game_participants_session  ON public.game_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_game_participants_student  ON public.game_participants(student_id);
CREATE INDEX IF NOT EXISTS idx_game_session_qs_session   ON public.game_session_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_game_responses_session    ON public.game_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_game_responses_student    ON public.game_responses(student_id);

-- ── 9. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.game_questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_seen_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_participants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_session_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_responses         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage game_questions"         ON public.game_questions;
DROP POLICY IF EXISTS "Authenticated users can manage student_seen_questions" ON public.student_seen_questions;
DROP POLICY IF EXISTS "Authenticated users can manage game_sessions"          ON public.game_sessions;
DROP POLICY IF EXISTS "Authenticated users can manage game_participants"      ON public.game_participants;
DROP POLICY IF EXISTS "Authenticated users can manage game_session_questions" ON public.game_session_questions;
DROP POLICY IF EXISTS "Authenticated users can manage game_responses"         ON public.game_responses;

CREATE POLICY "Authenticated users can manage game_questions"
  ON public.game_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage student_seen_questions"
  ON public.student_seen_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage game_sessions"
  ON public.game_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage game_participants"
  ON public.game_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage game_session_questions"
  ON public.game_session_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage game_responses"
  ON public.game_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow student app (anon) to read game data and write their own responses
DROP POLICY IF EXISTS "anon can read game_questions"         ON public.game_questions;
DROP POLICY IF EXISTS "anon can read game_sessions"          ON public.game_sessions;
DROP POLICY IF EXISTS "anon can read game_session_questions" ON public.game_session_questions;
DROP POLICY IF EXISTS "anon can manage game_participants"    ON public.game_participants;
DROP POLICY IF EXISTS "anon can manage game_responses"       ON public.game_responses;
DROP POLICY IF EXISTS "anon can manage student_seen_questions" ON public.student_seen_questions;

CREATE POLICY "anon can read game_questions"
  ON public.game_questions FOR SELECT TO anon USING (true);

CREATE POLICY "anon can read game_sessions"
  ON public.game_sessions FOR SELECT TO anon USING (true);

CREATE POLICY "anon can read game_session_questions"
  ON public.game_session_questions FOR SELECT TO anon USING (true);

CREATE POLICY "anon can manage game_participants"
  ON public.game_participants FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon can manage game_responses"
  ON public.game_responses FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon can manage student_seen_questions"
  ON public.student_seen_questions FOR ALL TO anon USING (true) WITH CHECK (true);
