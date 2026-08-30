ALTER TABLE public.shadow_shifts
  ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS declined_at timestamptz;

UPDATE public.shadow_shifts SET public_token = gen_random_uuid() WHERE public_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shadow_shifts_public_token_key ON public.shadow_shifts (public_token);

CREATE OR REPLACE FUNCTION public.update_shadow_shift(p_id uuid, p_shift_date date, p_arrival_time time without time zone, p_trainer_person_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS shadow_shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.shadow_shifts;
  v_row public.shadow_shifts;
  v_reset boolean;
BEGIN
  SELECT * INTO v_old FROM public.shadow_shifts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shadow shift not found'; END IF;

  IF NOT public.person_can_manage(v_old.owner_id) THEN
    RAISE EXCEPTION 'Not authorized to manage this shadow shift';
  END IF;

  IF p_shift_date IS NULL THEN RAISE EXCEPTION 'A date is required'; END IF;
  IF p_arrival_time IS NULL THEN RAISE EXCEPTION 'An arrival time is required'; END IF;

  IF p_trainer_person_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.people
       WHERE id = p_trainer_person_id AND owner_id = v_old.owner_id
    ) THEN
      RAISE EXCEPTION 'Trainer must belong to the same restaurant';
    END IF;
  END IF;

  -- Compare stored values to the incoming values server-side. Only a moved
  -- date or arrival time invalidates the trainee's confirmation or decline.
  v_reset := (p_shift_date IS DISTINCT FROM v_old.shift_date)
          OR (p_arrival_time IS DISTINCT FROM v_old.arrival_time);

  UPDATE public.shadow_shifts
     SET shift_date = p_shift_date,
         arrival_time = p_arrival_time,
         trainer_person_id = p_trainer_person_id,
         note = NULLIF(TRIM(COALESCE(p_note, '')), ''),
         confirmed_at = CASE WHEN v_reset THEN NULL ELSE confirmed_at END,
         declined_at  = CASE WHEN v_reset THEN NULL ELSE declined_at END,
         updated_at = now()
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_shadow_shift_by_token(p_token uuid)
 RETURNS TABLE(
   shift_date date,
   arrival_time time without time zone,
   role text,
   status text,
   confirmed_at timestamptz,
   declined_at timestamptz,
   first_name text,
   trainer_first_name text,
   restaurant_name text,
   address text,
   restaurant_phone text,
   note text,
   shadow_packet jsonb
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    ss.shift_date,
    ss.arrival_time,
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
    COALESCE(pr.shadow_packet, '{}'::jsonb) AS shadow_packet
  FROM public.shadow_shifts ss
  JOIN public.people pe ON pe.id = ss.person_id
  LEFT JOIN public.people tr ON tr.id = ss.trainer_person_id
  LEFT JOIN public.profiles pr ON pr.id = ss.owner_id
  WHERE ss.public_token = p_token
$function$;

CREATE OR REPLACE FUNCTION public.confirm_shadow_shift_by_token(p_token uuid)
 RETURNS TABLE(
   shift_date date,
   arrival_time time without time zone,
   role text,
   status text,
   confirmed_at timestamptz,
   declined_at timestamptz,
   first_name text,
   trainer_first_name text,
   restaurant_name text,
   address text,
   restaurant_phone text,
   note text,
   shadow_packet jsonb
 )
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.decline_shadow_shift_by_token(p_token uuid)
 RETURNS TABLE(
   shift_date date,
   arrival_time time without time zone,
   role text,
   status text,
   confirmed_at timestamptz,
   declined_at timestamptz,
   first_name text,
   trainer_first_name text,
   restaurant_name text,
   address text,
   restaurant_phone text,
   note text,
   shadow_packet jsonb
 )
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
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