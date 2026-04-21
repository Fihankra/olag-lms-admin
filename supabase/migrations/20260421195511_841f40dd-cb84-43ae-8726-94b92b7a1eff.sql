-- Add created_by to folders
ALTER TABLE public.folders ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add created_by to files
ALTER TABLE public.files ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update RLS on folders: everyone can read, only creator or admin can modify
DROP POLICY IF EXISTS "Authenticated users can manage folders" ON public.folders;

CREATE POLICY "Authenticated users can read folders"
  ON public.folders FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create folders"
  ON public.folders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Owner or admin can update folders"
  ON public.folders FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner or admin can delete folders"
  ON public.folders FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'));

-- Update RLS on files: everyone can read, only creator or admin can modify
DROP POLICY IF EXISTS "Authenticated users can manage files" ON public.files;

CREATE POLICY "Authenticated users can read files"
  ON public.files FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create files"
  ON public.files FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Owner or admin can update files"
  ON public.files FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner or admin can delete files"
  ON public.files FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'));