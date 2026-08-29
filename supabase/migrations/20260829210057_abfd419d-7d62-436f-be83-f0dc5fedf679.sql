CREATE TABLE public.shadow_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role text NOT NULL,
  shift_date date NOT NULL,
  arrival_time time NOT NULL,
  trainer_person_id uuid NULL REFERENCES public.people(id) ON DELETE SET NULL,
  note text NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
  confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shadow_shifts_owner_date_idx ON public.shadow_shifts (owner_id, shift_date);
CREATE INDEX shadow_shifts_person_idx ON public.shadow_shifts (person_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shadow_shifts TO authenticated;
GRANT ALL ON public.shadow_shifts TO service_role;

ALTER TABLE public.shadow_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read shadow shifts"
  ON public.shadow_shifts FOR SELECT TO authenticated
  USING (public.person_can_manage(owner_id));

CREATE POLICY "Managers create shadow shifts"
  ON public.shadow_shifts FOR INSERT TO authenticated
  WITH CHECK (public.person_can_manage(owner_id));

CREATE POLICY "Managers update shadow shifts"
  ON public.shadow_shifts FOR UPDATE TO authenticated
  USING (public.person_can_manage(owner_id))
  WITH CHECK (public.person_can_manage(owner_id));

CREATE POLICY "Managers delete shadow shifts"
  ON public.shadow_shifts FOR DELETE TO authenticated
  USING (public.person_can_manage(owner_id));

CREATE TRIGGER update_shadow_shifts_updated_at
  BEFORE UPDATE ON public.shadow_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_shadow_shift(
  p_person_id uuid,
  p_role text,
  p_shift_date date,
  p_arrival_time time,
  p_trainer_person_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS public.shadow_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person public.people;
  v_row public.shadow_shifts;
  v_role text := NULLIF(TRIM(COALESCE(p_role, '')), '');
BEGIN
  SELECT * INTO v_person FROM public.people WHERE id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Person not found'; END IF;

  IF NOT public.person_can_manage(v_person.owner_id) THEN
    RAISE EXCEPTION 'Not authorized to manage this person';
  END IF;

  IF v_role IS NULL THEN RAISE EXCEPTION 'A role is required'; END IF;
  IF p_shift_date IS NULL THEN RAISE EXCEPTION 'A date is required'; END IF;
  IF p_arrival_time IS NULL THEN RAISE EXCEPTION 'An arrival time is required'; END IF;

  IF p_trainer_person_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.people
       WHERE id = p_trainer_person_id AND owner_id = v_person.owner_id
    ) THEN
      RAISE EXCEPTION 'Trainer must belong to the same restaurant';
    END IF;
  END IF;

  INSERT INTO public.shadow_shifts
    (owner_id, person_id, role, shift_date, arrival_time, trainer_person_id, note)
  VALUES
    (v_person.owner_id, p_person_id, v_role, p_shift_date, p_arrival_time,
     p_trainer_person_id, NULLIF(TRIM(COALESCE(p_note, '')), ''))
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
$$;

REVOKE ALL ON FUNCTION public.create_shadow_shift(uuid, text, date, time, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_shadow_shift(uuid, text, date, time, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_shadow_shift(
  p_id uuid,
  p_shift_date date,
  p_arrival_time time,
  p_trainer_person_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS public.shadow_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- date or arrival time invalidates the trainee's confirmation.
  v_reset := (p_shift_date IS DISTINCT FROM v_old.shift_date)
          OR (p_arrival_time IS DISTINCT FROM v_old.arrival_time);

  UPDATE public.shadow_shifts
     SET shift_date = p_shift_date,
         arrival_time = p_arrival_time,
         trainer_person_id = p_trainer_person_id,
         note = NULLIF(TRIM(COALESCE(p_note, '')), ''),
         confirmed_at = CASE WHEN v_reset THEN NULL ELSE confirmed_at END,
         updated_at = now()
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_shadow_shift(uuid, date, time, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_shadow_shift(uuid, date, time, uuid, text) TO authenticated;