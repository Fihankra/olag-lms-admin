-- Global question bank for the student quiz game
CREATE TABLE public.game_questions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  subject       text NOT NULL,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('multiple_choice', 'short_answer')),
  difficulty    text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  source        text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'teacher')),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_game_questions_subject ON public.game_questions(subject);
CREATE INDEX idx_game_questions_type ON public.game_questions(question_type);

-- Options for multiple_choice game questions
CREATE TABLE public.game_question_options (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES public.game_questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct  boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_game_question_options_question ON public.game_question_options(question_id);

-- Accepted keywords for short_answer game questions
CREATE TABLE public.game_question_keywords (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES public.game_questions(id) ON DELETE CASCADE,
  keyword     text NOT NULL
);

CREATE INDEX idx_game_question_keywords_question ON public.game_question_keywords(question_id);

-- Track which questions each student has already seen
CREATE TABLE public.student_seen_questions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.game_questions(id) ON DELETE CASCADE,
  seen_at     timestamptz DEFAULT now(),
  UNIQUE(student_id, question_id)
);

CREATE INDEX idx_student_seen_student ON public.student_seen_questions(student_id);
CREATE INDEX idx_student_seen_question ON public.student_seen_questions(question_id);

-- RLS
ALTER TABLE public.game_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage game_questions" ON public.game_questions;
CREATE POLICY "Authenticated users can manage game_questions"
  ON public.game_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.game_question_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage game_question_options" ON public.game_question_options;
CREATE POLICY "Authenticated users can manage game_question_options"
  ON public.game_question_options FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.game_question_keywords ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage game_question_keywords" ON public.game_question_keywords;
CREATE POLICY "Authenticated users can manage game_question_keywords"
  ON public.game_question_keywords FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.student_seen_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage student_seen_questions" ON public.student_seen_questions;
CREATE POLICY "Authenticated users can manage student_seen_questions"
  ON public.student_seen_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);
