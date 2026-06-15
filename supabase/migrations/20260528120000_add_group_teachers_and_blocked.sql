-- Add blocked flag to group_members so admins/teachers can mute a student (read-only)
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;

-- Junction table for co-teachers on a group (beyond the primary teacher_id)
CREATE TABLE IF NOT EXISTS public.group_teachers (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id   uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(group_id, teacher_id)
);
