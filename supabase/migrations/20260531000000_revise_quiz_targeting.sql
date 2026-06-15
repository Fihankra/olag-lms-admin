-- Consolidate quiz targeting into quiz_targets.
-- Previously, class-targeted quizzes stored class_id on the quizzes row
-- while student-targeted quizzes used quiz_targets. This forced the student
-- app to run two separate checks. After this migration, quiz_targets is the
-- single source of truth: one row per target, either class_id OR student_id.

-- 1. Allow student_id to be null (class-targeted rows have no student_id)
ALTER TABLE public.quiz_targets
  ALTER COLUMN student_id DROP NOT NULL;

-- 2. Add class_id to quiz_targets
ALTER TABLE public.quiz_targets
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE;

-- 3. Migrate existing class-targeted quizzes into quiz_targets
INSERT INTO public.quiz_targets (quiz_id, class_id)
SELECT id, class_id
FROM public.quizzes
WHERE class_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Enforce: exactly one of (class_id, student_id) must be populated
ALTER TABLE public.quiz_targets
  ADD CONSTRAINT quiz_targets_target_check CHECK (
    (class_id IS NOT NULL AND student_id IS NULL) OR
    (student_id IS NOT NULL AND class_id IS NULL)
  );

-- 5. Replace the old unique constraint with partial unique indexes
ALTER TABLE public.quiz_targets
  DROP CONSTRAINT IF EXISTS quiz_targets_quiz_id_student_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS quiz_targets_quiz_class_uidx
  ON public.quiz_targets(quiz_id, class_id) WHERE class_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS quiz_targets_quiz_student_uidx
  ON public.quiz_targets(quiz_id, student_id) WHERE student_id IS NOT NULL;

-- 6. Remove class_id from quizzes — it now lives in quiz_targets
ALTER TABLE public.quizzes DROP COLUMN IF EXISTS class_id;
