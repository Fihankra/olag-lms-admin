CREATE TABLE public.report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  kiosk_status boolean,
  device_condition text,
  missing_status boolean,
  lms_status text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.report_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read report history"
  ON public.report_history FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert report history"
  ON public.report_history FOR INSERT TO authenticated
  WITH CHECK (true);