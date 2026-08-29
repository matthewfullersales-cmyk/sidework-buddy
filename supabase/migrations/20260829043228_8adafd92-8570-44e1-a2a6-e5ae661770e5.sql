CREATE OR REPLACE FUNCTION public.enforce_person_self_edit_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_j jsonb := to_jsonb(OLD);
  new_j jsonb := to_jsonb(NEW);
  k text;
  allowlist text[] := ARRAY['email','phone','emergency_contact','push_opt_in','updated_at',
                            'weekly_availability','onboarding_started','personal_info_complete'];
BEGIN
  -- Bypass: server-side / service-role callers (no auth context)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bypass: owner or a manager with schedule/hiring authority for this restaurant
  IF auth.uid() = OLD.owner_id
     OR public.can_manage_schedule_for(OLD.owner_id)
     OR public.can_manage_hiring_for(OLD.owner_id) THEN
    RETURN NEW;
  END IF;

  -- Self-edit: walk every changed key and enforce the allowlist
  FOR k IN
    SELECT key
    FROM jsonb_each(old_j) o
    WHERE new_j -> o.key IS DISTINCT FROM o.value
  LOOP
    IF NOT (k = ANY (allowlist)) THEN
      RAISE EXCEPTION 'people: column "%" cannot be edited by the person', k;
    END IF;

    IF k = 'weekly_availability' AND OLD.personal_info_complete THEN
      RAISE EXCEPTION 'people: weekly_availability cannot be edited after personal info is complete';
    END IF;

    IF k = 'onboarding_started' AND OLD.onboarding_started AND NOT NEW.onboarding_started THEN
      RAISE EXCEPTION 'people: onboarding_started cannot be unset';
    END IF;

    IF k = 'personal_info_complete' AND OLD.personal_info_complete AND NOT NEW.personal_info_complete THEN
      RAISE EXCEPTION 'people: personal_info_complete cannot be unset';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;