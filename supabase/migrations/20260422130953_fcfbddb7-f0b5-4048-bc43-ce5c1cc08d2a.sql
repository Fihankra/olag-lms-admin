-- Add missing_accessories and fault_description to reports
ALTER TABLE public.reports
  ADD COLUMN missing_accessories text[] DEFAULT '{}',
  ADD COLUMN fault_description text DEFAULT NULL;

-- Add same columns to report_history
ALTER TABLE public.report_history
  ADD COLUMN missing_accessories text[] DEFAULT '{}',
  ADD COLUMN fault_description text DEFAULT NULL;