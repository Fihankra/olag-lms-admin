DROP FUNCTION IF EXISTS public.get_student_for_login(text, text);

CREATE OR REPLACE FUNCTION public.get_student_for_login(_student_id text, _raw_password text)
RETURNS TABLE (
  id uuid,
  name text,
  student_id text,
  class_id uuid,
  program_id uuid,
  form student_form,
  gender student_gender,
  assigned_device_id uuid,
  password_hash text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.student_id, s.class_id, s.program_id,
         s.form, s.gender, s.assigned_device_id,
         s.password_hash, s.created_at
  FROM public.students s
  WHERE lower(s.student_id) = lower(trim(_student_id))
    AND lower(trim(_raw_password)) = lower(trim(_student_id))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_for_login(text, text) TO anon, authenticated;