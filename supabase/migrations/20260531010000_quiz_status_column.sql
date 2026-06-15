-- Replace is_published boolean with status text (draft / active / completed).
-- Safe to re-run: ADD COLUMN IF NOT EXISTS skips if already applied.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'active', 'completed'));

-- Migrate existing rows (no-op if is_published column is already gone)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quizzes'
      AND column_name  = 'is_published'
  ) THEN
    UPDATE public.quizzes SET status = 'active' WHERE is_published = true;
    UPDATE public.quizzes SET status = 'draft'  WHERE is_published = false;
    ALTER TABLE public.quizzes DROP COLUMN is_published;
  END IF;
END $$;
