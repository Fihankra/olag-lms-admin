-- Adds helpers for searching students by code and fetching pending invitations.
-- Run this AFTER 20260615000000_game_multiplayer_redesign.sql.

-- Index to speed up student-code lookups
CREATE INDEX IF NOT EXISTS idx_students_student_id_lower
  ON public.students (LOWER(student_id));

-- Search for students by student_id code (case-insensitive prefix/contains match).
-- Used by the "Challenge by code" feature in the game matchmaking screen.
CREATE OR REPLACE FUNCTION public.search_student_by_code(
  _code               text,
  _exclude_student_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, student_id text)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT s.id, s.name, s.student_id
  FROM   public.students s
  WHERE  LOWER(s.student_id) LIKE '%' || LOWER(_code) || '%'
    AND  (_exclude_student_id IS NULL OR s.id <> _exclude_student_id)
  ORDER  BY s.student_id
  LIMIT  10;
$$;

-- Fetch all pending invitations for a student (used on GamesHomePage load).
CREATE OR REPLACE FUNCTION public.fetch_pending_invitations(
  _student_id uuid
)
RETURNS SETOF public.game_invitations
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT *
  FROM   public.game_invitations
  WHERE  to_student_id = _student_id
    AND  status        = 'pending'
  ORDER  BY created_at DESC;
$$;
