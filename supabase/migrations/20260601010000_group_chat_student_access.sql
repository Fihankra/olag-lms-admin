-- Group chat: audio support + anon access for student app (no Supabase Auth).
-- All writes go through SECURITY DEFINER functions; reads use permissive anon
-- policies so Realtime subscriptions work without auth.uid().

-- ── 1. Add audio columns to messages ─────────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type        text    NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS audio_url           text,
  ADD COLUMN IF NOT EXISTS audio_duration_seconds integer;

-- ── 2. Anon SELECT policies ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon can read groups"        ON public.groups;
CREATE POLICY "anon can read groups"
  ON public.groups FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon can read group_members" ON public.group_members;
CREATE POLICY "anon can read group_members"
  ON public.group_members FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon can read messages"      ON public.messages;
CREATE POLICY "anon can read messages"
  ON public.messages FOR SELECT TO anon USING (true);

-- ── 3. get_student_groups ─────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_student_groups(uuid);

CREATE OR REPLACE FUNCTION public.get_student_groups(_student_id uuid)
RETURNS TABLE (
  id                uuid,
  name              text,
  description       text,
  teacher_id        uuid,
  created_at        timestamptz,
  member_count      bigint,
  is_blocked        boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    g.id,
    g.name,
    g.description,
    g.teacher_id,
    g.created_at,
    (SELECT count(*)
     FROM public.group_members gm2
     WHERE gm2.group_id = g.id)   AS member_count,
    gm.blocked                     AS is_blocked
  FROM public.groups g
  JOIN public.group_members gm
    ON gm.group_id = g.id
   AND gm.student_id = _student_id
  ORDER BY g.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_groups(uuid) TO anon, authenticated;

-- ── 4. send_group_message ─────────────────────────────────────────────────────
-- Validates membership + blocked status before inserting.

DROP FUNCTION IF EXISTS public.send_group_message(uuid, uuid, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.send_group_message(
  _group_id               uuid,
  _student_id             uuid,
  _content                text    DEFAULT '',
  _message_type           text    DEFAULT 'text',
  _audio_url              text    DEFAULT NULL,
  _audio_duration_seconds integer DEFAULT NULL
)
RETURNS SETOF public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _member record;
BEGIN
  SELECT * INTO _member
  FROM public.group_members
  WHERE group_id  = _group_id
    AND student_id = _student_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a member of this group.';
  END IF;

  IF _member.blocked THEN
    RAISE EXCEPTION 'You are blocked from sending messages in this group.';
  END IF;

  RETURN QUERY
  INSERT INTO public.messages
    (group_id, sender_student_id, content, message_type, audio_url, audio_duration_seconds)
  VALUES
    (_group_id, _student_id, _content, _message_type, _audio_url, _audio_duration_seconds)
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.send_group_message(uuid, uuid, text, text, text, integer)
  TO anon, authenticated;

-- ── 5. Storage bucket for audio messages ──────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'group-audio',
  'group-audio',
  true,
  10485760,
  ARRAY['audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/mp4',
        'audio/x-m4a', 'audio/mp3', 'audio/webm', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon can upload group audio" ON storage.objects;
CREATE POLICY "anon can upload group audio"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'group-audio');

DROP POLICY IF EXISTS "anyone can read group audio" ON storage.objects;
CREATE POLICY "anyone can read group audio"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'group-audio');
