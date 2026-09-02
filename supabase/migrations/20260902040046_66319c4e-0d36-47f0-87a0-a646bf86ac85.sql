-- 1. Schema
ALTER TABLE public.shadow_shifts ADD COLUMN IF NOT EXISTS end_time time without time zone;
ALTER TABLE public.shadow_shifts ADD COLUMN IF NOT EXISTS calendar_seq integer NOT NULL DEFAULT 0;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS calendar_seq integer NOT NULL DEFAULT 0;

-- Generic bump trigger, mirroring public.update_updated_at_column()
CREATE OR REPLACE FUNCTION public.bump_calendar_seq()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.calendar_seq = COALESCE(OLD.calendar_seq, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_calendar_seq_shadow_shifts ON public.shadow_shifts;
CREATE TRIGGER bump_calendar_seq_shadow_shifts
  BEFORE UPDATE ON public.shadow_shifts
  FOR EACH ROW EXECUTE FUNCTION public.bump_calendar_seq();

DROP TRIGGER IF EXISTS bump_calendar_seq_interviews ON public.interviews;
CREATE TRIGGER bump_calendar_seq_interviews
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.bump_calendar_seq();

-- 2. RPCs: drop old signatures explicitly
DROP FUNCTION IF EXISTS public.create_shadow_shift(uuid, text, date, time without time zone, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.update_shadow_shift(uuid, date, time without time zone, uuid, text, text, text);

CREATE FUNCTION public.create_shadow_shift(
  p_person_id uuid,
  p_role text,
  p_shift_date date,
  p_arrival_time time without time zone,
  p_trainer_person_id uuid DEFAULT NULL::uuid,
  p_note text DEFAULT NULL::text,
  p_section text DEFAULT NULL::text,
  p_dress_group text DEFAULT NULL::text,
  p_end_time time without time zone DEFAULT NULL::time without time zone
)
RETURNS shadow_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_person public.people;
  v_row public.shadow_shifts;
  v_role text := NULLIF(TRIM(COALESCE(p_role, '')), '');
  v_section text := LOWER(NULLIF(TRIM(COALESCE(p_section, '')), ''));
  v_dress text := LOWER(NULLIF(TRIM(COALESCE(p_dress_group, '')), ''));
BEGIN
  SELECT * INTO v_person FROM public.people WHERE id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Person not found'; END IF;

  IF NOT public.person_can_manage(v_person.owner_id) THEN
    RAISE EXCEPTION 'Not authorized to manage this person';
  END IF;

  IF v_role IS NULL THEN RAISE EXCEPTION 'A role is required'; END IF;
  IF p_shift_date IS NULL THEN RAISE EXCEPTION 'A date is required'; END IF;
  IF p_arrival_time IS NULL THEN RAISE EXCEPTION 'An arrival time is required'; END IF;
  IF p_end_time IS NOT NULL AND p_end_time <= p_arrival_time THEN
    RAISE EXCEPTION 'The end time must be after the arrival time';
  END IF;

  IF v_section IS NOT NULL AND v_section NOT IN ('foh','boh') THEN v_section := NULL; END IF;
  IF v_dress IS NOT NULL AND v_dress NOT IN ('foh','host','boh') THEN v_dress := NULL; END IF;

  IF p_trainer_person_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.people
       WHERE id = p_trainer_person_id AND owner_id = v_person.owner_id
    ) THEN
      RAISE EXCEPTION 'Trainer must belong to the same restaurant';
    END IF;
  END IF;

  INSERT INTO public.shadow_shifts
    (owner_id, person_id, role, shift_date, arrival_time, end_time, trainer_person_id, note, section, dress_group)
  VALUES
    (v_person.owner_id, p_person_id, v_role, p_shift_date, p_arrival_time, p_end_time,
     p_trainer_person_id, NULLIF(TRIM(COALESCE(p_note, '')), ''), v_section, v_dress)
  RETURNING * INTO v_row;

  PERFORM set_config('app.person_guard_bypass','on',true);
  UPDATE public.people
     SET state = 'shadow',
         state_changed_at = now(),
         updated_at = now()
   WHERE id = p_person_id
     AND state IS DISTINCT FROM 'shadow';
  PERFORM set_config('app.person_guard_bypass','off',true);

  RETURN v_row;
END;
$function$;

CREATE FUNCTION public.update_shadow_shift(
  p_id uuid,
  p_shift_date date,
  p_arrival_time time without time zone,
  p_trainer_person_id uuid DEFAULT NULL::uuid,
  p_note text DEFAULT NULL::text,
  p_section text DEFAULT NULL::text,
  p_dress_group text DEFAULT NULL::text,
  p_end_time time without time zone DEFAULT NULL::time without time zone
)
RETURNS shadow_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.shadow_shifts;
  v_row public.shadow_shifts;
  v_reset boolean;
  v_section text := LOWER(NULLIF(TRIM(COALESCE(p_section, '')), ''));
  v_dress text := LOWER(NULLIF(TRIM(COALESCE(p_dress_group, '')), ''));
BEGIN
  SELECT * INTO v_old FROM public.shadow_shifts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shadow shift not found'; END IF;

  IF NOT public.person_can_manage(v_old.owner_id) THEN
    RAISE EXCEPTION 'Not authorized to manage this shadow shift';
  END IF;

  IF p_shift_date IS NULL THEN RAISE EXCEPTION 'A date is required'; END IF;
  IF p_arrival_time IS NULL THEN RAISE EXCEPTION 'An arrival time is required'; END IF;
  IF p_end_time IS NOT NULL AND p_end_time <= p_arrival_time THEN
    RAISE EXCEPTION 'The end time must be after the arrival time';
  END IF;

  IF v_section IS NOT NULL AND v_section NOT IN ('foh','boh') THEN v_section := NULL; END IF;
  IF v_dress IS NOT NULL AND v_dress NOT IN ('foh','host','boh') THEN v_dress := NULL; END IF;

  IF p_trainer_person_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.people
       WHERE id = p_trainer_person_id AND owner_id = v_old.owner_id
    ) THEN
      RAISE EXCEPTION 'Trainer must belong to the same restaurant';
    END IF;
  END IF;

  -- Only a moved date or arrival time invalidates the trainee's confirmation
  -- or decline. Section, dress group and end time must never clear it.
  v_reset := (p_shift_date IS DISTINCT FROM v_old.shift_date)
          OR (p_arrival_time IS DISTINCT FROM v_old.arrival_time);

  UPDATE public.shadow_shifts
     SET shift_date = p_shift_date,
         arrival_time = p_arrival_time,
         end_time = p_end_time,
         trainer_person_id = p_trainer_person_id,
         note = NULLIF(TRIM(COALESCE(p_note, '')), ''),
         section = COALESCE(v_section, section),
         dress_group = COALESCE(v_dress, dress_group),
         confirmed_at = CASE WHEN v_reset THEN NULL ELSE confirmed_at END,
         declined_at  = CASE WHEN v_reset THEN NULL ELSE declined_at END,
         updated_at = now()
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- 3. Public token-scoped views need the end time
DROP FUNCTION IF EXISTS public.confirm_shadow_shift_by_token(uuid);
DROP FUNCTION IF EXISTS public.decline_shadow_shift_by_token(uuid);
DROP FUNCTION IF EXISTS public.get_public_shadow_shift_by_token(uuid);

CREATE FUNCTION public.get_public_shadow_shift_by_token(p_token uuid)
RETURNS TABLE(shift_date date, arrival_time time without time zone, end_time time without time zone, role text, status text, confirmed_at timestamp with time zone, declined_at timestamp with time zone, first_name text, trainer_first_name text, restaurant_name text, address text, restaurant_phone text, note text, shadow_packet jsonb, section text, dress_group text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    ss.shift_date,
    ss.arrival_time,
    ss.end_time,
    ss.role,
    ss.status,
    ss.confirmed_at,
    ss.declined_at,
    pe.first_name,
    tr.first_name AS trainer_first_name,
    pr.restaurant_name,
    NULLIF(TRIM(CONCAT_WS(', ',
      NULLIF(pr.business_info->>'street',''),
      NULLIF(pr.business_info->>'city',''),
      NULLIF(CONCAT_WS(' ', NULLIF(pr.business_info->>'state',''), NULLIF(pr.business_info->>'zip','')), ''))), '') AS address,
    NULLIF(pr.business_info->>'phone','') AS restaurant_phone,
    ss.note,
    COALESCE(pr.shadow_packet, '{}'::jsonb) AS shadow_packet,
    ss.section,
    ss.dress_group
  FROM public.shadow_shifts ss
  JOIN public.people pe ON pe.id = ss.person_id
  LEFT JOIN public.people tr ON tr.id = ss.trainer_person_id
  LEFT JOIN public.profiles pr ON pr.id = ss.owner_id
  WHERE ss.public_token = p_token
$function$;

CREATE FUNCTION public.confirm_shadow_shift_by_token(p_token uuid)
RETURNS TABLE(shift_date date, arrival_time time without time zone, end_time time without time zone, role text, status text, confirmed_at timestamp with time zone, declined_at timestamp with time zone, first_name text, trainer_first_name text, restaurant_name text, address text, restaurant_phone text, note text, shadow_packet jsonb, section text, dress_group text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.shadow_shifts ss
     SET confirmed_at = now(),
         declined_at = NULL,
         updated_at = now()
   WHERE ss.public_token = p_token
     AND ss.status = 'scheduled';

  RETURN QUERY SELECT * FROM public.get_public_shadow_shift_by_token(p_token);
END;
$function$;

CREATE FUNCTION public.decline_shadow_shift_by_token(p_token uuid)
RETURNS TABLE(shift_date date, arrival_time time without time zone, end_time time without time zone, role text, status text, confirmed_at timestamp with time zone, declined_at timestamp with time zone, first_name text, trainer_first_name text, restaurant_name text, address text, restaurant_phone text, note text, shadow_packet jsonb, section text, dress_group text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.shadow_shifts ss
     SET declined_at = now(),
         confirmed_at = NULL,
         updated_at = now()
   WHERE ss.public_token = p_token
     AND ss.status = 'scheduled';

  RETURN QUERY SELECT * FROM public.get_public_shadow_shift_by_token(p_token);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_shadow_shift_by_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_shadow_shift_by_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decline_shadow_shift_by_token(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_shadow_shift_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_shadow_shift_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decline_shadow_shift_by_token(uuid) TO anon, authenticated;