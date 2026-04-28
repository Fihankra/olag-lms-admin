
-- Trigger function to keep assigned_student_code in sync with assigned_student_id
CREATE OR REPLACE FUNCTION public.sync_device_assigned_student_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_student_id IS NULL THEN
    NEW.assigned_student_code := NULL;
  ELSE
    SELECT student_id INTO NEW.assigned_student_code
    FROM public.students
    WHERE id = NEW.assigned_student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_device_assigned_student_code ON public.devices;

CREATE TRIGGER trg_sync_device_assigned_student_code
BEFORE INSERT OR UPDATE OF assigned_student_id ON public.devices
FOR EACH ROW
EXECUTE FUNCTION public.sync_device_assigned_student_code();

-- Backfill any rows currently out of sync
UPDATE public.devices d
SET assigned_student_code = s.student_id
FROM public.students s
WHERE d.assigned_student_id = s.id
  AND (d.assigned_student_code IS DISTINCT FROM s.student_id);

UPDATE public.devices
SET assigned_student_code = NULL
WHERE assigned_student_id IS NULL
  AND assigned_student_code IS NOT NULL;
