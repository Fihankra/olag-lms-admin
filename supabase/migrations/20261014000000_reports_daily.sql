-- Reports are no longer weekly: form masters report for any date they choose.
-- Existing rows keep their week_start value as their report date.

ALTER TABLE public.reports RENAME COLUMN week_start TO report_date;

ALTER INDEX IF EXISTS public.idx_reports_week RENAME TO idx_reports_date;

CREATE INDEX IF NOT EXISTS idx_reports_class_date ON public.reports(class_id, report_date);

-- The weekly deadline settings no longer apply
DELETE FROM public.settings WHERE key IN ('report_deadline', 'report_week_start');
