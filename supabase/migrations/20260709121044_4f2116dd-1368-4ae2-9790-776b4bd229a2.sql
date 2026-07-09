
-- Trigger: on shift_trades approval, reassign the underlying shift to claimed_by
CREATE OR REPLACE FUNCTION public.apply_trade_shift_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND NEW.claimed_by IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'approved' OR OLD.claimed_by IS DISTINCT FROM NEW.claimed_by)
  THEN
    UPDATE public.shifts
       SET employee_id = NEW.claimed_by,
           updated_at = now()
     WHERE id = NEW.shift_id
       AND owner_id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_trade_shift_reassignment ON public.shift_trades;
CREATE TRIGGER trg_apply_trade_shift_reassignment
AFTER INSERT OR UPDATE OF status, claimed_by ON public.shift_trades
FOR EACH ROW EXECUTE FUNCTION public.apply_trade_shift_reassignment();

-- RPC: coworker first names for the trade board, scoped to same restaurant.
-- Callable by the owner, any team member of that owner, or any employee whose
-- auth_user_id belongs to that owner. Only returns (id, first_name) — no phone/email.
CREATE OR REPLACE FUNCTION public.get_restaurant_coworker_names(p_owner_id uuid)
RETURNS TABLE(employee_id uuid, first_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, COALESCE(NULLIF(TRIM(e.first_name), ''), split_part(COALESCE(e.name,''), ' ', 1))
  FROM public.restaurant_employees e
  WHERE e.owner_id = p_owner_id
    AND (
      auth.uid() = p_owner_id
      OR EXISTS (
        SELECT 1 FROM public.restaurant_team_members tm
        WHERE tm.owner_id = p_owner_id AND tm.auth_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.restaurant_employees me
        WHERE me.owner_id = p_owner_id AND me.auth_user_id = auth.uid()
      )
    )
$$;

GRANT EXECUTE ON FUNCTION public.get_restaurant_coworker_names(uuid) TO authenticated;
