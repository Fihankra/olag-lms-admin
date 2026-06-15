-- Multiplayer game redesign: persistent pairings + invitation-based matchmaking.
-- Replaces the PIN-based lobby tables from the previous migration.
-- All writes from the student app go through anon role, so RLS is permissive for anon.

-- ── 1. Drop old PIN-based tables (safe if they don't exist) ──────────────────

DROP TABLE IF EXISTS public.game_responses        CASCADE;
DROP TABLE IF EXISTS public.game_session_questions CASCADE;
DROP TABLE IF EXISTS public.game_participants      CASCADE;
DROP TABLE IF EXISTS public.game_sessions          CASCADE;

-- ── 2. Fix RLS on game_questions (anon students must be able to read) ─────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'game_questions'
      AND policyname = 'students can read questions'
  ) THEN
    DROP POLICY "students can read questions" ON public.game_questions;
  END IF;
END $$;

DROP POLICY IF EXISTS "anon_game_questions_read"         ON public.game_questions;
DROP POLICY IF EXISTS "authenticated_game_questions_all" ON public.game_questions;

CREATE POLICY "anon_game_questions_read"
  ON public.game_questions FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_game_questions_all"
  ON public.game_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 3. Fix RLS on student_seen_questions (anon needs INSERT + SELECT) ─────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'student_seen_questions'
      AND policyname = 'students can read own seen questions'
  ) THEN
    DROP POLICY "students can read own seen questions" ON public.student_seen_questions;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'student_seen_questions'
      AND policyname = 'students can insert seen questions'
  ) THEN
    DROP POLICY "students can insert seen questions" ON public.student_seen_questions;
  END IF;
END $$;

DROP POLICY IF EXISTS "anon_seen_questions_all"  ON public.student_seen_questions;
DROP POLICY IF EXISTS "auth_seen_questions_all"  ON public.student_seen_questions;

CREATE POLICY "anon_seen_questions_all"
  ON public.student_seen_questions FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "auth_seen_questions_all"
  ON public.student_seen_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 4. Persistent pairings between two students ───────────────────────────────
-- student1_id is always LEAST(a,b) so the pair is unique regardless of who initiates.

CREATE TABLE IF NOT EXISTS public.game_pairings (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  student1_id  uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student2_id  uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  CONSTRAINT game_pairings_unique_pair UNIQUE (student1_id, student2_id),
  CONSTRAINT game_pairings_no_self     CHECK  (student1_id <> student2_id)
);

-- ── 5. Game sessions (solo or multiplayer) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  pairing_id   uuid        REFERENCES public.game_pairings(id) ON DELETE CASCADE,
  subject      text        NOT NULL,
  difficulty   text        NOT NULL,
  is_solo      boolean     NOT NULL DEFAULT false,
  status       text        NOT NULL DEFAULT 'waiting'
                           CHECK (status IN ('waiting','active','completed','cancelled')),
  created_by   uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  started_at   timestamptz,
  completed_at timestamptz
);

-- ── 6. Questions assigned to a session (same pool, each player shuffles locally) ─

CREATE TABLE IF NOT EXISTS public.game_session_questions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  uuid NOT NULL REFERENCES public.game_sessions(id)   ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.game_questions(id)  ON DELETE CASCADE,
  UNIQUE (session_id, question_id)
);

-- ── 7. Per-student score for each session ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_participant_scores (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id      uuid        NOT NULL REFERENCES public.game_sessions(id)  ON DELETE CASCADE,
  student_id      uuid        NOT NULL REFERENCES public.students(id)        ON DELETE CASCADE,
  score           int         NOT NULL DEFAULT 0,
  correct_answers int         NOT NULL DEFAULT 0,
  total_questions int         NOT NULL DEFAULT 0,
  completed_at    timestamptz,
  UNIQUE (session_id, student_id)
);

-- ── 8. Individual question responses ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_responses (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id      uuid        NOT NULL REFERENCES public.game_sessions(id)  ON DELETE CASCADE,
  student_id      uuid        NOT NULL REFERENCES public.students(id)        ON DELETE CASCADE,
  question_id     uuid        NOT NULL REFERENCES public.game_questions(id)  ON DELETE CASCADE,
  selected_answer text,       -- null = timed out
  is_correct      boolean     NOT NULL DEFAULT false,
  points_earned   int         NOT NULL DEFAULT 0,
  answered_at     timestamptz DEFAULT now(),
  UNIQUE (session_id, student_id, question_id)
);

-- ── 9. Matchmaking: students broadcasting availability ─────────────────────────

CREATE TABLE IF NOT EXISTS public.game_match_requests (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id   uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name text        NOT NULL,
  subject      text        NOT NULL,
  difficulty   text        NOT NULL,
  status       text        NOT NULL DEFAULT 'searching'
                           CHECK (status IN ('searching','matched','cancelled')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (student_id)
);

-- ── 10. Direct invitations between students ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_invitations (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  from_student_id   uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_student_name text        NOT NULL,
  to_student_id     uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  session_id        uuid        REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  subject           text        NOT NULL,
  difficulty        text        NOT NULL,
  status            text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','accepted','declined','expired')),
  created_at        timestamptz DEFAULT now(),
  CONSTRAINT game_invitations_no_self CHECK (from_student_id <> to_student_id)
);

-- ── 11. RLS for all new tables ────────────────────────────────────────────────

ALTER TABLE public.game_pairings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_session_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_participant_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_responses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_match_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_invitations         ENABLE ROW LEVEL SECURITY;

-- Anon (student app) — full access
CREATE POLICY "anon_game_pairings"           ON public.game_pairings           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_game_sessions"           ON public.game_sessions           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_game_session_questions"  ON public.game_session_questions  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_game_participant_scores" ON public.game_participant_scores FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_game_responses"          ON public.game_responses          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_game_match_requests"     ON public.game_match_requests     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_game_invitations"        ON public.game_invitations        FOR ALL TO anon USING (true) WITH CHECK (true);

-- Authenticated (admin dashboard) — full access
CREATE POLICY "auth_game_pairings"           ON public.game_pairings           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_game_sessions"           ON public.game_sessions           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_game_session_questions"  ON public.game_session_questions  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_game_participant_scores" ON public.game_participant_scores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_game_responses"          ON public.game_responses          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_game_match_requests"     ON public.game_match_requests     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_game_invitations"        ON public.game_invitations        FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 12. Enable Realtime on live-update tables ─────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_match_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_invitations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_participant_scores;

-- ── 13. RPCs ──────────────────────────────────────────────────────────────────

-- Return questions a student hasn't seen yet for a given subject + difficulty.
-- Ordered randomly by Postgres — client shuffles again with a per-student seed
-- so two players get a different order from the same pool.
CREATE OR REPLACE FUNCTION public.fetch_game_questions(
  _student_id uuid,
  _subject    text,
  _difficulty text,
  _limit      int DEFAULT 10
)
RETURNS SETOF public.game_questions
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT gq.*
  FROM   public.game_questions gq
  WHERE  gq.subject    = _subject
    AND  gq.difficulty = _difficulty
    AND  gq.id NOT IN (
           SELECT question_id
           FROM   public.student_seen_questions
           WHERE  student_id = _student_id
         )
  ORDER  BY random()
  LIMIT  _limit;
$$;

-- Same but returns only questions neither of the two students has seen.
CREATE OR REPLACE FUNCTION public.fetch_game_questions_for_pair(
  _student_a  uuid,
  _student_b  uuid,
  _subject    text,
  _difficulty text,
  _limit      int DEFAULT 10
)
RETURNS SETOF public.game_questions
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT gq.*
  FROM   public.game_questions gq
  WHERE  gq.subject    = _subject
    AND  gq.difficulty = _difficulty
    AND  gq.id NOT IN (
           SELECT question_id
           FROM   public.student_seen_questions
           WHERE  student_id IN (_student_a, _student_b)
         )
  ORDER  BY random()
  LIMIT  _limit;
$$;

-- Mark a list of questions as seen for a student (idempotent).
CREATE OR REPLACE FUNCTION public.mark_questions_seen(
  _student_id  uuid,
  _question_ids uuid[]
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  INSERT INTO public.student_seen_questions (student_id, question_id)
  SELECT _student_id, unnest(_question_ids)
  ON CONFLICT DO NOTHING;
$$;

-- Get or create a persistent pairing between two students.
-- Always stores the smaller UUID as student1_id to guarantee uniqueness.
CREATE OR REPLACE FUNCTION public.get_or_create_game_pairing(
  _student_a uuid,
  _student_b uuid
)
RETURNS public.game_pairings
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  _s1      uuid := LEAST(_student_a, _student_b);
  _s2      uuid := GREATEST(_student_a, _student_b);
  _pairing public.game_pairings;
BEGIN
  INSERT INTO public.game_pairings (student1_id, student2_id)
  VALUES (_s1, _s2)
  ON CONFLICT (student1_id, student2_id) DO NOTHING;

  SELECT * INTO _pairing
  FROM   public.game_pairings
  WHERE  student1_id = _s1 AND student2_id = _s2;

  RETURN _pairing;
END;
$$;

-- Distinct subjects available in game_questions.
CREATE OR REPLACE FUNCTION public.get_game_subjects()
RETURNS TABLE(subject text)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT DISTINCT subject FROM public.game_questions ORDER BY subject;
$$;

-- Distinct difficulties for a given subject.
CREATE OR REPLACE FUNCTION public.get_game_difficulties(_subject text)
RETURNS TABLE(difficulty text)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT difficulty
  FROM   public.game_questions
  WHERE  subject = _subject
  GROUP  BY difficulty
  ORDER  BY CASE difficulty
              WHEN 'easy'   THEN 1
              WHEN 'medium' THEN 2
              WHEN 'hard'   THEN 3
              ELSE               4
            END;
$$;
