-- Fix: password comparison was case-sensitive but default passwords were
-- seeded as lower(student_id), so entering the student ID in its original
-- casing (e.g. "STU001" vs stored "stu001") always failed.
-- Now both sides are lowercased before comparing.

DROP FUNCTION IF EXISTS public.get_student_for_login(text, text);

CREATE OR REPLACE FUNCTION public.get_student_for_login(_student_id text, _raw_password text)
RETURNS TABLE (
  id uuid,
  student_id text,
  name text,
  password text,
  program_id uuid,
  class_id uuid,
  assigned_device_id uuid,
  gender public.student_gender,
  form public.student_form,
  created_at timestamptz,
  program_name text,
  class_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.id,
    s.student_id,
    s.name,
    s.password,
    s.program_id,
    s.class_id,
    s.assigned_device_id,
    s.gender,
    s.form,
    s.created_at,
    p.name AS program_name,
    c.name AS class_name
  FROM public.students s
  LEFT JOIN public.programs p ON p.id = s.program_id
  LEFT JOIN public.classes c ON c.id = s.class_id
  WHERE lower(s.student_id) = lower(trim(_student_id))
    AND lower(s.password)   = lower(trim(_raw_password))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_for_login(text, text) TO anon, authenticated;
