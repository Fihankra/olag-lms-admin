ALTER TABLE public.quizzes ADD COLUMN class_id uuid;
ALTER TABLE public.quizzes ALTER COLUMN group_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quizzes_class_id ON public.quizzes(class_id);