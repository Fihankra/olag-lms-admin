-- Materials permissions:
--   * everyone (staff and the student app) can still read all folders and files
--   * teachers can only rename, delete, set access on, upload to, or remove
--     files from folders they created
--   * admins can manage everything
--
-- Storage paths in the materials bucket are "<folder_id>/<file>", so uploads
-- and deletes are checked against the owner of that folder.

CREATE OR REPLACE FUNCTION public.can_manage_folder(_folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (
           SELECT 1 FROM public.folders
           WHERE id = _folder_id AND created_by = auth.uid()
         );
$$;

-- Storage helper: object name -> folder id (NULL when the prefix isn't a uuid)
CREATE OR REPLACE FUNCTION public.materials_folder_id(_object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN split_part(_object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_object_name, '/', 1)::uuid
  END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_folder(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.materials_folder_id(text) TO authenticated;

-- ── folders (read policy unchanged) ──────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can create folders" ON public.folders;
DROP POLICY IF EXISTS "Owner or admin can update folders" ON public.folders;
DROP POLICY IF EXISTS "Owner or admin can delete folders" ON public.folders;

CREATE POLICY "Users create their own folders"
  ON public.folders FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owner or admin can update folders"
  ON public.folders FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner or admin can delete folders"
  ON public.folders FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ── files (read policy unchanged) ────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can create files" ON public.files;
DROP POLICY IF EXISTS "Owner or admin can update files" ON public.files;
DROP POLICY IF EXISTS "Owner or admin can delete files" ON public.files;

CREATE POLICY "Folder owner or admin can add files"
  ON public.files FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_manage_folder(folder_id));

CREATE POLICY "Folder owner or admin can update files"
  ON public.files FOR UPDATE TO authenticated
  USING (public.can_manage_folder(folder_id))
  WITH CHECK (public.can_manage_folder(folder_id));

CREATE POLICY "Folder owner or admin can delete files"
  ON public.files FOR DELETE TO authenticated
  USING (public.can_manage_folder(folder_id));

-- ── storage (materials bucket stays public-read) ─────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can upload materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete materials" ON storage.objects;

CREATE POLICY "Folder owner or admin can upload materials"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'materials'
    AND public.can_manage_folder(public.materials_folder_id(name))
  );

CREATE POLICY "Folder owner or admin can delete materials"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'materials'
    AND public.can_manage_folder(public.materials_folder_id(name))
  );
