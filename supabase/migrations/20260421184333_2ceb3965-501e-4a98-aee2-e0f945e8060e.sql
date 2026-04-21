-- Create folders table
CREATE TABLE public.folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  accessible_programs UUID[] DEFAULT '{}',
  accessible_classes UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage folders"
  ON public.folders FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Create files table
CREATE TABLE public.files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'unknown',
  file_size BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage files"
  ON public.files FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_files_folder_id ON public.files(folder_id);

-- Create materials storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('materials', 'materials', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload materials"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'materials');

CREATE POLICY "Anyone can view materials"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'materials');

CREATE POLICY "Authenticated users can delete materials"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'materials');
