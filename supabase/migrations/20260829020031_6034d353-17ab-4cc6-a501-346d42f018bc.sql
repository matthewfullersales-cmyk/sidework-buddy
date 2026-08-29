-- 1. Unified person record
CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NULL,
  phone text NULL,
  state text NOT NULL DEFAULT 'applicant',
  state_changed_at timestamptz NOT NULL DEFAULT now(),
  job_id uuid NULL REFERENCES public.job_postings(id) ON DELETE SET NULL,
  source text NULL,
  applied_at timestamptz NULL,
  hired_at timestamptz NULL,
  primary_role text NULL,
  approved_roles text[] NOT NULL DEFAULT '{}',
  auto_approve_roles text[] NOT NULL DEFAULT '{}',
  is_trainer_for_roles text[] NOT NULL DEFAULT '{}',
  emergency_contact jsonb NULL,
  resume_path text NULL,
  work_experience jsonb NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT people_state_check CHECK (state IN ('applicant','interviewing','shadow','hired','active','inactive','rejected'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
GRANT ALL ON public.people TO service_role;

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view their people"
  ON public.people FOR SELECT TO authenticated
  USING (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id));

CREATE POLICY "Managers can add people"
  ON public.people FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id));

CREATE POLICY "Managers can update their people"
  ON public.people FOR UPDATE TO authenticated
  USING (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id))
  WITH CHECK (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id));

CREATE POLICY "Managers can delete their people"
  ON public.people FOR DELETE TO authenticated
  USING (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id));

CREATE POLICY "A person can view their own record"
  ON public.people FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "A person can update their own contact details"
  ON public.people FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE INDEX people_owner_state_idx ON public.people (owner_id, state);
CREATE INDEX people_owner_archived_idx ON public.people (owner_id, archived);
CREATE UNIQUE INDEX people_auth_user_id_key ON public.people (auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE TRIGGER update_people_updated_at
  BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Self-edit scope trigger
CREATE OR REPLACE FUNCTION public.enforce_person_self_edit_scope()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RETURN NEW; END IF;
  IF (caller = OLD.owner_id)
     OR public.can_manage_schedule_for(OLD.owner_id)
     OR public.can_manage_hiring_for(OLD.owner_id)
  THEN RETURN NEW; END IF;

  IF NEW.owner_id            IS DISTINCT FROM OLD.owner_id            THEN RAISE EXCEPTION 'Cannot change owner_id'; END IF;
  IF NEW.auth_user_id        IS DISTINCT FROM OLD.auth_user_id        THEN RAISE EXCEPTION 'Cannot change auth_user_id'; END IF;
  IF NEW.state               IS DISTINCT FROM OLD.state               THEN RAISE EXCEPTION 'Cannot change state'; END IF;
  IF NEW.state_changed_at    IS DISTINCT FROM OLD.state_changed_at    THEN RAISE EXCEPTION 'Cannot change state_changed_at'; END IF;
  IF NEW.primary_role        IS DISTINCT FROM OLD.primary_role        THEN RAISE EXCEPTION 'Cannot change primary_role'; END IF;
  IF NEW.approved_roles      IS DISTINCT FROM OLD.approved_roles      THEN RAISE EXCEPTION 'Cannot change approved_roles'; END IF;
  IF NEW.auto_approve_roles  IS DISTINCT FROM OLD.auto_approve_roles  THEN RAISE EXCEPTION 'Cannot change auto_approve_roles'; END IF;
  IF NEW.is_trainer_for_roles IS DISTINCT FROM OLD.is_trainer_for_roles THEN RAISE EXCEPTION 'Cannot change is_trainer_for_roles'; END IF;
  IF NEW.first_name          IS DISTINCT FROM OLD.first_name          THEN RAISE EXCEPTION 'Cannot change first_name'; END IF;
  IF NEW.last_name           IS DISTINCT FROM OLD.last_name           THEN RAISE EXCEPTION 'Cannot change last_name'; END IF;
  IF NEW.job_id              IS DISTINCT FROM OLD.job_id              THEN RAISE EXCEPTION 'Cannot change job_id'; END IF;
  IF NEW.hired_at            IS DISTINCT FROM OLD.hired_at            THEN RAISE EXCEPTION 'Cannot change hired_at'; END IF;
  IF NEW.applied_at          IS DISTINCT FROM OLD.applied_at          THEN RAISE EXCEPTION 'Cannot change applied_at'; END IF;
  IF NEW.archived            IS DISTINCT FROM OLD.archived            THEN RAISE EXCEPTION 'Cannot change archived'; END IF;
  IF NEW.source              IS DISTINCT FROM OLD.source              THEN RAISE EXCEPTION 'Cannot change source'; END IF;
  IF NEW.resume_path         IS DISTINCT FROM OLD.resume_path         THEN RAISE EXCEPTION 'Cannot change resume_path'; END IF;
  IF NEW.work_experience     IS DISTINCT FROM OLD.work_experience     THEN RAISE EXCEPTION 'Cannot change work_experience'; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_person_self_edit_scope() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_person_self_edit_scope_trg
  BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.enforce_person_self_edit_scope();

-- 3. State transition helper
CREATE OR REPLACE FUNCTION public.set_person_state(p_person_id uuid, p_new_state text)
RETURNS public.people
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  row public.people;
BEGIN
  IF p_new_state IS NULL OR p_new_state NOT IN ('applicant','interviewing','shadow','hired','active','inactive','rejected') THEN
    RAISE EXCEPTION 'Invalid state: %', p_new_state;
  END IF;

  SELECT * INTO row FROM public.people WHERE id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Person not found'; END IF;

  IF NOT (auth.uid() = row.owner_id
          OR public.can_manage_schedule_for(row.owner_id)
          OR public.can_manage_hiring_for(row.owner_id)) THEN
    RAISE EXCEPTION 'Not authorized to manage this person';
  END IF;

  UPDATE public.people
     SET state = p_new_state,
         state_changed_at = now(),
         hired_at = CASE WHEN p_new_state = 'hired' AND hired_at IS NULL THEN now() ELSE hired_at END,
         updated_at = now()
   WHERE id = p_person_id
   RETURNING * INTO row;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_person_state(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_person_state(uuid, text) TO authenticated;

-- 4. Public application intake
CREATE OR REPLACE FUNCTION public.submit_application(
  p_owner_slug text,
  p_job_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_source text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_id uuid;
  v_first text := left(btrim(coalesce(p_first_name, '')), 80);
  v_last  text := left(btrim(coalesce(p_last_name, '')), 80);
  v_email text := nullif(left(btrim(coalesce(p_email, '')), 160), '');
  v_phone text := nullif(left(btrim(coalesce(p_phone, '')), 40), '');
  v_source text := nullif(left(btrim(coalesce(p_source, '')), 40), '');
BEGIN
  IF v_first = '' OR v_last = '' THEN
    RAISE EXCEPTION 'First and last name are required';
  END IF;

  IF coalesce(btrim(p_owner_slug), '') <> '' THEN
    SELECT owner_id INTO v_owner FROM public.get_public_join_restaurant(btrim(p_owner_slug));
  END IF;

  IF v_owner IS NULL AND p_job_id IS NOT NULL THEN
    SELECT owner_id INTO v_owner FROM public.job_postings WHERE id = p_job_id AND open;
  END IF;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Could not resolve the restaurant for this application';
  END IF;

  INSERT INTO public.people (owner_id, first_name, last_name, email, phone, state, state_changed_at, job_id, source, applied_at)
  VALUES (v_owner, v_first, v_last, v_email, v_phone, 'applicant', now(), p_job_id, v_source, now())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_application(text, uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_application(text, uuid, text, text, text, text, text) TO anon, authenticated;