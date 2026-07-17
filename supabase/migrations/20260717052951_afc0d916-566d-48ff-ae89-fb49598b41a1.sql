-- push_subscriptions: one row per browser subscription per employee
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.restaurant_employees(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emp_manage_own_push_subs" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.restaurant_employees e
            WHERE e.id = push_subscriptions.employee_id
              AND e.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.restaurant_employees e
            WHERE e.id = push_subscriptions.employee_id
              AND e.auth_user_id = auth.uid()
              AND e.owner_id = push_subscriptions.owner_id)
  );

CREATE POLICY "owner_read_own_push_subs" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE INDEX push_subscriptions_employee_idx ON public.push_subscriptions(employee_id);
CREATE INDEX push_subscriptions_owner_idx ON public.push_subscriptions(owner_id);

-- push_opt_in column on restaurant_employees
ALTER TABLE public.restaurant_employees
  ADD COLUMN IF NOT EXISTS push_opt_in BOOLEAN NOT NULL DEFAULT false;

-- employee_notifications: persistent per-employee in-app inbox
CREATE TABLE public.employee_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.restaurant_employees(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('schedule_published','schedule_changed','trade_posted','timeoff_resolved')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_notifications TO authenticated;
GRANT ALL ON public.employee_notifications TO service_role;
ALTER TABLE public.employee_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emp_read_own_notifs" ON public.employee_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.restaurant_employees e
            WHERE e.id = employee_notifications.employee_id
              AND e.auth_user_id = auth.uid())
  );

CREATE POLICY "emp_update_own_notifs" ON public.employee_notifications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.restaurant_employees e
            WHERE e.id = employee_notifications.employee_id
              AND e.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.restaurant_employees e
            WHERE e.id = employee_notifications.employee_id
              AND e.auth_user_id = auth.uid())
  );

CREATE POLICY "owner_read_own_notifs" ON public.employee_notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

-- Owner may insert notifications for their own employees; employees may insert
-- for teammates in the same restaurant (needed for postTrade fan-out).
CREATE POLICY "insert_notifs_same_restaurant" ON public.employee_notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = owner_id
    OR EXISTS (SELECT 1 FROM public.restaurant_employees me
               WHERE me.auth_user_id = auth.uid()
                 AND me.owner_id = employee_notifications.owner_id)
  );

CREATE INDEX employee_notifications_emp_created_idx
  ON public.employee_notifications(employee_id, created_at DESC);
CREATE INDEX employee_notifications_owner_created_idx
  ON public.employee_notifications(owner_id, created_at DESC);
