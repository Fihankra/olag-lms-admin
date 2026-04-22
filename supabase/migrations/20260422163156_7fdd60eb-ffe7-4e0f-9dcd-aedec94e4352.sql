
-- MESSAGES (group chat)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  sender_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Sender can delete own messages"
  ON public.messages FOR DELETE TO authenticated
  USING (
    sender_teacher_id IN (SELECT id FROM public.teachers WHERE user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Enable realtime for group chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- QUIZZES
CREATE TABLE public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_minutes INT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read quizzes"
  ON public.quizzes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Teachers can manage quizzes"
  ON public.quizzes FOR ALL TO authenticated
  USING (
    created_by IN (SELECT id FROM public.teachers WHERE user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    created_by IN (SELECT id FROM public.teachers WHERE user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- QUIZ SUBMISSIONS
CREATE TABLE public.quiz_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  score NUMERIC,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, student_id)
);

ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read submissions"
  ON public.quiz_submissions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert submissions"
  ON public.quiz_submissions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update submissions"
  ON public.quiz_submissions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
