
-- 1. get_employee_context RPC
CREATE OR REPLACE FUNCTION public.get_employee_context()
RETURNS TABLE(owner_id uuid, employee_id uuid, restaurant_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.owner_id, e.id AS employee_id, p.restaurant_name
  FROM public.restaurant_employees e
  LEFT JOIN public.profiles p ON p.id = e.owner_id
  WHERE e.auth_user_id = auth.uid()
  LIMIT 1
$$;

-- 2. Helper: can this employee claim a shift with role X?
CREATE OR REPLACE FUNCTION public.employee_can_claim_role(p_owner_id uuid, p_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.restaurant_employees e
    WHERE e.auth_user_id = auth.uid()
      AND e.owner_id = p_owner_id
      AND p_role = ANY(COALESCE(e.approved_roles, ARRAY[]::text[]))
  )
$$;

-- 3. Trigger to lock privileged columns from employee self-edits
CREATE OR REPLACE FUNCTION public.enforce_employee_self_edit_scope()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  -- Owner or scheduling/hiring manager may change anything
  is_privileged := (auth.uid() = OLD.owner_id)
    OR public.can_manage_schedule_for(OLD.owner_id)
    OR public.can_manage_hiring_for(OLD.owner_id);

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Employee self-edit: block changes to locked columns
  IF NEW.owner_id           IS DISTINCT FROM OLD.owner_id           THEN RAISE EXCEPTION 'Cannot change owner_id'; END IF;
  IF NEW.auth_user_id       IS DISTINCT FROM OLD.auth_user_id       THEN RAISE EXCEPTION 'Cannot change auth_user_id'; END IF;
  IF NEW.local_id           IS DISTINCT FROM OLD.local_id           THEN RAISE EXCEPTION 'Cannot change local_id'; END IF;
  IF NEW.position           IS DISTINCT FROM OLD.position           THEN RAISE EXCEPTION 'Cannot change position'; END IF;
  IF NEW.section            IS DISTINCT FROM OLD.section            THEN RAISE EXCEPTION 'Cannot change section'; END IF;
  IF NEW.primary_role       IS DISTINCT FROM OLD.primary_role       THEN RAISE EXCEPTION 'Cannot change primary_role'; END IF;
  IF NEW.approved_roles     IS DISTINCT FROM OLD.approved_roles     THEN RAISE EXCEPTION 'Cannot change approved_roles'; END IF;
  IF NEW.auto_approve_roles IS DISTINCT FROM OLD.auto_approve_roles THEN RAISE EXCEPTION 'Cannot change auto_approve_roles'; END IF;
  IF NEW.seniority          IS DISTINCT FROM OLD.seniority          THEN RAISE EXCEPTION 'Cannot change seniority'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_employee_self_edit_scope_trg ON public.restaurant_employees;
CREATE TRIGGER enforce_employee_self_edit_scope_trg
  BEFORE UPDATE ON public.restaurant_employees
  FOR EACH ROW EXECUTE FUNCTION public.enforce_employee_self_edit_scope();

-- 4. restaurant_employees: employees can view + update their own row
CREATE POLICY "Employees view own row"
  ON public.restaurant_employees FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Employees update own row"
  ON public.restaurant_employees FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- 5. shifts: employees can view own shifts + shifts on open trade board
CREATE POLICY "Employees view own shifts"
  ON public.shifts FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.restaurant_employees WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Employees view trade-board shifts"
  ON public.shifts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shift_trades t
      JOIN public.restaurant_employees me ON me.auth_user_id = auth.uid()
      WHERE t.shift_id = shifts.id
        AND t.owner_id = shifts.owner_id
        AND me.owner_id = shifts.owner_id
        AND t.status IN ('open', 'pending_approval')
    )
  );

-- 6. time_off_requests: employees see + submit their own
CREATE POLICY "Employees view own timeoff"
  ON public.time_off_requests FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.restaurant_employees WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Employees insert own timeoff"
  ON public.time_off_requests FOR INSERT
  WITH CHECK (
    employee_id IN (
      SELECT id FROM public.restaurant_employees
      WHERE auth_user_id = auth.uid() AND owner_id = time_off_requests.owner_id
    )
  );

-- 7. shift_trades: employees see open trades for their owner, can post own, can claim if role-approved
CREATE POLICY "Employees view trades in their restaurant"
  ON public.shift_trades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_employees me
      WHERE me.auth_user_id = auth.uid()
        AND me.owner_id = shift_trades.owner_id
    )
  );

CREATE POLICY "Employees post own shift trade"
  ON public.shift_trades FOR INSERT
  WITH CHECK (
    posted_by IN (
      SELECT id FROM public.restaurant_employees
      WHERE auth_user_id = auth.uid() AND owner_id = shift_trades.owner_id
    )
    AND EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_trades.shift_id
        AND s.owner_id = shift_trades.owner_id
        AND s.employee_id = shift_trades.posted_by
    )
  );

-- UPDATE for claim: caller must be an employee of this owner, target trade must be open,
-- claimed_by must be caller's own employee id, and caller must be approved for the shift's role.
CREATE POLICY "Employees claim open trades"
  ON public.shift_trades FOR UPDATE
  USING (
    status = 'open'
    AND EXISTS (
      SELECT 1 FROM public.restaurant_employees me
      WHERE me.auth_user_id = auth.uid()
        AND me.owner_id = shift_trades.owner_id
    )
  )
  WITH CHECK (
    claimed_by IN (
      SELECT id FROM public.restaurant_employees
      WHERE auth_user_id = auth.uid() AND owner_id = shift_trades.owner_id
    )
    AND EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_trades.shift_id
        AND public.employee_can_claim_role(shift_trades.owner_id, s.role)
    )
  );
