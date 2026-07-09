
CREATE OR REPLACE FUNCTION public.enforce_employee_self_edit_scope()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  -- Service role / admin (no auth.uid()) bypasses this check entirely.
  IF caller IS NULL THEN
    RETURN NEW;
  END IF;
  -- Owner or scheduling/hiring manager may change anything.
  IF (caller = OLD.owner_id)
     OR public.can_manage_schedule_for(OLD.owner_id)
     OR public.can_manage_hiring_for(OLD.owner_id)
  THEN
    RETURN NEW;
  END IF;
  -- Employee self-edit: block changes to locked columns.
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
