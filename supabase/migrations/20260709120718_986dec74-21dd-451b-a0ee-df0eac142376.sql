
CREATE OR REPLACE FUNCTION public.shift_is_on_trade_board(p_shift_id uuid, p_owner_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shift_trades t
    WHERE t.shift_id = p_shift_id
      AND t.owner_id = p_owner_id
      AND t.status IN ('open', 'pending_approval')
  )
$$;

DROP POLICY IF EXISTS "Employees view trade-board shifts" ON public.shifts;
CREATE POLICY "Employees view trade-board shifts"
  ON public.shifts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_employees me
      WHERE me.auth_user_id = auth.uid()
        AND me.owner_id = shifts.owner_id
    )
    AND public.shift_is_on_trade_board(shifts.id, shifts.owner_id)
  );
