ALTER TABLE public.employee_notifications DROP CONSTRAINT employee_notifications_kind_check;
ALTER TABLE public.employee_notifications ADD CONSTRAINT employee_notifications_kind_check
CHECK (kind = ANY (ARRAY['schedule_published'::text, 'schedule_changed'::text, 'trade_posted'::text, 'timeoff_resolved'::text, 'availability_resolved'::text]));