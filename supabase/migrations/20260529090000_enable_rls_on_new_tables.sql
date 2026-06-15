ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage quizzes" ON public.quizzes;
CREATE POLICY "Authenticated users can manage quizzes"
  ON public.quizzes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage quiz_submissions" ON public.quiz_submissions;
CREATE POLICY "Authenticated users can manage quiz_submissions"
  ON public.quiz_submissions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.group_teachers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage group_teachers" ON public.group_teachers;
CREATE POLICY "Authenticated users can manage group_teachers"
  ON public.group_teachers FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage group_members" ON public.group_members;
CREATE POLICY "Authenticated users can manage group_members"
  ON public.group_members FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage quiz_questions" ON public.quiz_questions;
CREATE POLICY "Authenticated users can manage quiz_questions"
  ON public.quiz_questions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.quiz_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage quiz_options" ON public.quiz_options;
CREATE POLICY "Authenticated users can manage quiz_options"
  ON public.quiz_options FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.quiz_keywords ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage quiz_keywords" ON public.quiz_keywords;
CREATE POLICY "Authenticated users can manage quiz_keywords"
  ON public.quiz_keywords FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.quiz_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage quiz_targets" ON public.quiz_targets;
CREATE POLICY "Authenticated users can manage quiz_targets"
  ON public.quiz_targets FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage quiz_attempts" ON public.quiz_attempts;
CREATE POLICY "Authenticated users can manage quiz_attempts"
  ON public.quiz_attempts FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage quiz_responses" ON public.quiz_responses;
CREATE POLICY "Authenticated users can manage quiz_responses"
  ON public.quiz_responses FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
