ALTER TABLE public.students RENAME COLUMN password_hash TO password;

UPDATE public.students SET password = lower(student_id) WHERE password IS NULL OR password = '';

DROP FUNCTION IF EXISTS public.get_student_for_login(text, text);

CREATE OR REPLACE FUNCTION public.get_student_for_login(_student_id text, _raw_password text)
RETURNS SETOF public.students
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM public.students s
  WHERE lower(s.student_id) = lower(trim(_student_id))
    AND s.password = trim(_raw_password)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_for_login(text, text) TO anon, authenticated;