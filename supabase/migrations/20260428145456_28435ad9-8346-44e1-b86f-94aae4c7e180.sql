ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS assigned_student_code text;

-- Backfill from existing assignments
UPDATE public.devices d
SET assigned_student_code = s.student_id
FROM public.students s
WHERE d.assigned_student_id = s.id
  AND d.assigned_student_code IS NULL;