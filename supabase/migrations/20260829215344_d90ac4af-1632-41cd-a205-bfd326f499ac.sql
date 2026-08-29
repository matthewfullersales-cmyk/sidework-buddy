CREATE OR REPLACE FUNCTION public.hire_person(p_person_id uuid, p_primary_role text)
RETURNS public.people
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.people;
  v_role text := NULLIF(TRIM(COALESCE(p_primary_role, '')), '');
BEGIN
  SELECT * INTO v_row FROM public.people WHERE id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Person not found'; END IF;

  IF NOT public.person_can_manage(v_row.owner_id) THEN
    RAISE EXCEPTION 'Not authorized to manage this person';
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'A role is required to hire someone';
  END IF;

  PERFORM set_config('app.person_guard_bypass','on',true);
  UPDATE public.people
     SET state = 'hired',
         state_changed_at = now(),
         hired_at = now(),
         primary_role = v_role,
         approved_roles = CASE
           WHEN v_role = ANY(COALESCE(approved_roles, ARRAY[]::text[]))
             THEN approved_roles
           ELSE COALESCE(approved_roles, ARRAY[]::text[]) || v_role
         END,
         invite_token = CASE WHEN auth_user_id IS NULL THEN gen_random_uuid() ELSE invite_token END,
         invite_expires_at = CASE WHEN auth_user_id IS NULL THEN now() + interval '14 days' ELSE invite_expires_at END,
         invited_at = CASE WHEN auth_user_id IS NULL THEN now() ELSE invited_at END,
         joined_via = CASE WHEN auth_user_id IS NULL THEN 'hire' ELSE joined_via END,
         updated_at = now()
   WHERE id = p_person_id
   RETURNING * INTO v_row;
  PERFORM set_config('app.person_guard_bypass','off',true);

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.hire_person(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hire_person(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hire_person(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_person_on_profile_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.personal_info_complete, false) = false
     AND COALESCE(NEW.personal_info_complete, false) = true
     AND NEW.state = 'hired'
     AND NEW.auth_user_id IS NOT NULL THEN
    NEW.state := 'active';
    NEW.state_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_person_on_profile_complete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_activate_person_on_profile_complete_trg ON public.people;
CREATE TRIGGER zz_activate_person_on_profile_complete_trg
  BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.activate_person_on_profile_complete();