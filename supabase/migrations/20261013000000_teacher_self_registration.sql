-- Teachers can only be created through self-registration.
--
-- teacher_id_available: lets the (anonymous) register page check the ID before
-- creating an auth account, so a taken ID doesn't leave an orphaned login.
--
-- register_teacher: called by the newly signed-up user. Grants the teacher role
-- and either creates their teacher row or claims a legacy admin-created row
-- (user_id IS NULL) with the same teacher_id. Always resets approval.

CREATE OR REPLACE FUNCTION public.teacher_id_available(_teacher_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.teachers
    WHERE lower(teacher_id) = lower(trim(_teacher_id))
      AND user_id IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.teacher_id_available(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_teacher(_teacher_id text, _name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing public.teachers%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF coalesce(trim(_teacher_id), '') = '' OR coalesce(trim(_name), '') = '' THEN
    RAISE EXCEPTION 'Teacher ID and name are required';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'teacher')
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT * INTO _existing
  FROM public.teachers
  WHERE lower(teacher_id) = lower(trim(_teacher_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.teachers (teacher_id, name, user_id, approved)
    VALUES (trim(_teacher_id), trim(_name), _uid, false);
  ELSIF _existing.user_id IS NULL OR _existing.user_id = _uid THEN
    UPDATE public.teachers
    SET user_id = _uid, name = trim(_name), approved = false
    WHERE id = _existing.id;
  ELSE
    RAISE EXCEPTION 'Teacher ID % is already registered', trim(_teacher_id);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_teacher(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_teacher(text, text) TO authenticated;

-- Admin-only: login emails for teachers (auth.users isn't readable from the client)
CREATE OR REPLACE FUNCTION public.admin_teacher_emails()
RETURNS TABLE (teacher_id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can view teacher emails';
  END IF;
  RETURN QUERY
    SELECT t.id, u.email::text
    FROM public.teachers t
    JOIN auth.users u ON u.id = t.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_teacher_emails() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_teacher_emails() TO authenticated;

-- Admin-only: set a new password for a teacher. The teacher must change it on
-- next login (the app redirects when password_changed is false).
CREATE OR REPLACE FUNCTION public.admin_set_teacher_password(_teacher_id uuid, _password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reset teacher passwords';
  END IF;
  IF length(coalesce(_password, '')) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  SELECT user_id INTO _uid FROM public.teachers WHERE id = _teacher_id;
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'This teacher has no login account';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(_password, extensions.gen_salt('bf')),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                           || '{"password_changed": false}'::jsonb,
      updated_at = now()
  WHERE id = _uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_teacher_password(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_teacher_password(uuid, text) TO authenticated;

-- Block deleting a teacher who is still a form master
CREATE OR REPLACE FUNCTION public.prevent_form_master_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.assigned_class_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete % (%): they are a form master. Remove their class assignment first.',
      OLD.name, OLD.teacher_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_form_master_delete ON public.teachers;
CREATE TRIGGER trg_prevent_form_master_delete
  BEFORE DELETE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_form_master_delete();
