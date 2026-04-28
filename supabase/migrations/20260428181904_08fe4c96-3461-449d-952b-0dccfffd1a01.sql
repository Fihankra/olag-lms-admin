DROP FUNCTION IF EXISTS public.get_student_for_login(text);

CREATE OR REPLACE FUNCTION public.get_student_for_login(
  _student_id text,
  _raw_password text,
  _device_id text
)
RETURNS TABLE(
  id uuid,
  name text,
  student_id text,
  class_id uuid,
  program_id uuid,
  form student_form,
  gender student_gender,
  assigned_device_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.student_id, s.class_id, s.program_id,
         s.form, s.gender, s.assigned_device_id
  FROM public.students s
  JOIN public.devices d ON d.id = s.assigned_device_id
  WHERE lower(s.student_id) = lower(trim(_student_id))
    AND lower(trim(_raw_password)) = lower(trim(_student_id))
    AND lower(d.device_id) = lower(trim(_device_id))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_for_login(text, text, text) TO anon, authenticated;