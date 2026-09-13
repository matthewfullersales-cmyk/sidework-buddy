ALTER TABLE public.people ADD COLUMN IF NOT EXISTS manager_availability_edited_at timestamptz NULL;

ALTER TABLE public.employee_notifications DROP CONSTRAINT IF EXISTS employee_notifications_kind_check;
ALTER TABLE public.employee_notifications ADD CONSTRAINT employee_notifications_kind_check
  CHECK (kind = ANY (ARRAY['schedule_published'::text, 'schedule_changed'::text, 'trade_posted'::text, 'timeoff_resolved'::text, 'availability_resolved'::text, 'availability_edited'::text]));