-- 0. clear the single orphan push subscription
DELETE FROM public.push_subscriptions p
WHERE NOT EXISTS (SELECT 1 FROM public.people pe WHERE pe.id = p.employee_id);

-- 1. shifts
DROP POLICY IF EXISTS "Employees view own shifts" ON public.shifts;
CREATE POLICY "Employees view own shifts" ON public.shifts FOR SELECT
USING (employee_id IN (
  SELECT p.id FROM public.people p
  WHERE p.auth_user_id = auth.uid()
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
));

DROP POLICY IF EXISTS "Employees view trade-board shifts" ON public.shifts;
CREATE POLICY "Employees view trade-board shifts" ON public.shifts FOR SELECT
USING ((EXISTS (
  SELECT 1 FROM public.people me
  WHERE me.auth_user_id = auth.uid()
    AND me.owner_id = shifts.owner_id
    AND me.state IN ('hired','active','inactive','pending_approval')
    AND me.archived = false
)) AND public.shift_is_on_trade_board(id, owner_id));

-- 2. shift_trades
DROP POLICY IF EXISTS "Employees view trades in their restaurant" ON public.shift_trades;
CREATE POLICY "Employees view trades in their restaurant" ON public.shift_trades FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.people me
  WHERE me.auth_user_id = auth.uid()
    AND me.owner_id = shift_trades.owner_id
    AND me.state IN ('hired','active','inactive','pending_approval')
    AND me.archived = false
));

DROP POLICY IF EXISTS "Employees post own shift trade" ON public.shift_trades;
CREATE POLICY "Employees post own shift trade" ON public.shift_trades FOR INSERT
WITH CHECK ((posted_by IN (
  SELECT p.id FROM public.people p
  WHERE p.auth_user_id = auth.uid()
    AND p.owner_id = shift_trades.owner_id
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
)) AND (EXISTS (
  SELECT 1 FROM public.shifts s
  WHERE s.id = shift_trades.shift_id
    AND s.owner_id = shift_trades.owner_id
    AND s.employee_id = shift_trades.posted_by
)));

DROP POLICY IF EXISTS "Employees claim open trades" ON public.shift_trades;
CREATE POLICY "Employees claim open trades" ON public.shift_trades FOR UPDATE
USING ((status = 'open') AND (EXISTS (
  SELECT 1 FROM public.people me
  WHERE me.auth_user_id = auth.uid()
    AND me.owner_id = shift_trades.owner_id
    AND me.state IN ('hired','active','inactive','pending_approval')
    AND me.archived = false
)))
WITH CHECK ((claimed_by IN (
  SELECT p.id FROM public.people p
  WHERE p.auth_user_id = auth.uid()
    AND p.owner_id = shift_trades.owner_id
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
)) AND (EXISTS (
  SELECT 1 FROM public.shifts s
  WHERE s.id = shift_trades.shift_id
    AND public.employee_can_claim_role(shift_trades.owner_id, s.role)
)));

-- 3. time_off_requests
DROP POLICY IF EXISTS "Employees insert own timeoff" ON public.time_off_requests;
CREATE POLICY "Employees insert own timeoff" ON public.time_off_requests FOR INSERT
WITH CHECK (employee_id IN (
  SELECT p.id FROM public.people p
  WHERE p.auth_user_id = auth.uid()
    AND p.owner_id = time_off_requests.owner_id
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
));

-- 4. employee_notifications
DROP POLICY IF EXISTS "emp_read_own_notifs" ON public.employee_notifications;
CREATE POLICY "emp_read_own_notifs" ON public.employee_notifications FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.people p
  WHERE p.id = employee_notifications.employee_id
    AND p.auth_user_id = auth.uid()
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
));

DROP POLICY IF EXISTS "emp_update_own_notifs" ON public.employee_notifications;
CREATE POLICY "emp_update_own_notifs" ON public.employee_notifications FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.people p
  WHERE p.id = employee_notifications.employee_id
    AND p.auth_user_id = auth.uid()
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.people p
  WHERE p.id = employee_notifications.employee_id
    AND p.auth_user_id = auth.uid()
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
));

DROP POLICY IF EXISTS "insert_notifs_same_restaurant" ON public.employee_notifications;
CREATE POLICY "insert_notifs_same_restaurant" ON public.employee_notifications FOR INSERT
WITH CHECK ((auth.uid() = owner_id) OR (EXISTS (
  SELECT 1 FROM public.people me
  WHERE me.auth_user_id = auth.uid()
    AND me.owner_id = employee_notifications.owner_id
    AND me.state IN ('hired','active','inactive','pending_approval')
    AND me.archived = false
)));

-- 5. push_subscriptions
DROP POLICY IF EXISTS "emp_manage_own_push_subs" ON public.push_subscriptions;
CREATE POLICY "emp_manage_own_push_subs" ON public.push_subscriptions FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.people p
  WHERE p.id = push_subscriptions.employee_id
    AND p.auth_user_id = auth.uid()
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.people p
  WHERE p.id = push_subscriptions.employee_id
    AND p.auth_user_id = auth.uid()
    AND p.owner_id = push_subscriptions.owner_id
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
));

-- 6. training_progress
DROP POLICY IF EXISTS "Employee reads own training progress" ON public.training_progress;
CREATE POLICY "Employee reads own training progress" ON public.training_progress FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.people p
  WHERE p.id = training_progress.employee_id
    AND p.auth_user_id = auth.uid()
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
));

DROP POLICY IF EXISTS "Employee inserts own training progress" ON public.training_progress;
CREATE POLICY "Employee inserts own training progress" ON public.training_progress FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.people p
  WHERE p.id = training_progress.employee_id
    AND p.auth_user_id = auth.uid()
    AND p.owner_id = training_progress.owner_id
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
));

DROP POLICY IF EXISTS "Employee updates own training progress" ON public.training_progress;
CREATE POLICY "Employee updates own training progress" ON public.training_progress FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.people p
  WHERE p.id = training_progress.employee_id
    AND p.auth_user_id = auth.uid()
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.people p
  WHERE p.id = training_progress.employee_id
    AND p.auth_user_id = auth.uid()
    AND p.state IN ('hired','active','inactive','pending_approval')
    AND p.archived = false
));