-- 1. Slug columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS prior_slugs text[] NOT NULL DEFAULT '{}'::text[];

CREATE UNIQUE INDEX IF NOT EXISTS profiles_slug_lower_key
  ON public.profiles (lower(slug)) WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_prior_slugs_gin
  ON public.profiles USING gin (prior_slugs);

-- 2. Pending/active state for roster rows (fail closed: anything not 'active' is pending)
ALTER TABLE public.restaurant_employees
  ADD COLUMN IF NOT EXISTS join_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS joined_via text;

DO $$ BEGIN
  ALTER TABLE public.restaurant_employees
    ADD CONSTRAINT restaurant_employees_join_status_chk
    CHECK (join_status IN ('active', 'pending'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_employees_owner_auth_user_key
  ON public.restaurant_employees (owner_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- 3. Slug allocation (internal)
CREATE OR REPLACE FUNCTION public.allocate_restaurant_slug(p_base text, p_owner_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  base text;
  candidate text;
  n int := 1;
BEGIN
  base := public.slugify_name(p_base);
  IF base IS NULL OR base = '' OR base = 'team' THEN
    RETURN NULL; -- never hand out a shared literal slug
  END IF;
  candidate := base;
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p_owner_id IS NULL OR p.id <> p_owner_id)
        AND (lower(p.slug) = lower(candidate) OR candidate = ANY(p.prior_slugs))
    ) THEN
      RETURN candidate;
    END IF;
    n := n + 1;
    candidate := base || '-' || n::text;
    IF n > 500 THEN
      RETURN base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_restaurant_slug(text, uuid) FROM PUBLIC, anon, authenticated;

-- 4. Owner sets / changes their own slug; the old one is kept as an alias
CREATE OR REPLACE FUNCTION public.set_restaurant_slug(p_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  next_slug text;
  cur public.profiles;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO cur FROM public.profiles WHERE id = me FOR UPDATE;
  IF NOT FOUND OR cur.role <> 'owner' THEN RAISE EXCEPTION 'Only owners can set a join link'; END IF;
  IF COALESCE(NULLIF(TRIM(cur.restaurant_name), ''), '') = '' THEN
    RAISE EXCEPTION 'Set your restaurant name before creating a join link';
  END IF;

  next_slug := public.slugify_name(p_slug);
  IF next_slug IS NULL OR next_slug = '' OR next_slug = 'team' THEN
    RAISE EXCEPTION 'That join link is not allowed';
  END IF;
  IF lower(next_slug) = lower(COALESCE(cur.slug, '')) THEN
    RETURN cur.slug;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id <> me
      AND (lower(p.slug) = lower(next_slug) OR next_slug = ANY(p.prior_slugs))
  ) THEN
    RAISE EXCEPTION 'SLUG_TAKEN: That join link is already in use';
  END IF;

  UPDATE public.profiles
     SET slug = next_slug,
         prior_slugs = CASE
           WHEN cur.slug IS NULL THEN prior_slugs
           WHEN cur.slug = ANY(prior_slugs) THEN prior_slugs
           ELSE array_append(prior_slugs, cur.slug)
         END,
         updated_at = now()
   WHERE id = me;

  RETURN next_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.set_restaurant_slug(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_restaurant_slug(text) TO authenticated;

-- 5. Ensure the signed-in owner has a slug (called from the manager UI)
CREATE OR REPLACE FUNCTION public.ensure_my_restaurant_slug()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  cur public.profiles;
  next_slug text;
BEGIN
  IF me IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO cur FROM public.profiles WHERE id = me FOR UPDATE;
  IF NOT FOUND OR cur.role <> 'owner' THEN RETURN NULL; END IF;
  IF cur.slug IS NOT NULL THEN RETURN cur.slug; END IF;
  IF COALESCE(NULLIF(TRIM(cur.restaurant_name), ''), '') = '' THEN RETURN NULL; END IF;
  next_slug := public.allocate_restaurant_slug(cur.restaurant_name, me);
  IF next_slug IS NULL THEN RETURN NULL; END IF;
  UPDATE public.profiles SET slug = next_slug, updated_at = now() WHERE id = me;
  RETURN next_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_restaurant_slug() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_restaurant_slug() TO authenticated;

-- 6. Public resolver: exact slug (or a retired alias) -> owner id + display name ONLY
CREATE OR REPLACE FUNCTION public.get_public_join_restaurant(p_slug text)
RETURNS TABLE(owner_id uuid, restaurant_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.restaurant_name
  FROM public.profiles p
  WHERE p.role = 'owner'
    AND COALESCE(NULLIF(TRIM(p.restaurant_name), ''), '') <> ''
    AND p_slug IS NOT NULL
    AND TRIM(p_slug) <> ''
    AND (lower(p.slug) = lower(TRIM(p_slug)) OR lower(TRIM(p_slug)) = ANY(SELECT lower(x) FROM unnest(p.prior_slugs) x))
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_public_join_restaurant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_join_restaurant(text) TO anon, authenticated;

-- 7. Self-join: resolve slug server-side and insert a PENDING roster row
CREATE OR REPLACE FUNCTION public.join_restaurant_by_slug(p_slug text, p_auth_user_id uuid, p_patch jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_first text;
  v_last text;
  v_name text;
  v_role text;
  v_id uuid;
BEGIN
  IF p_auth_user_id IS NULL OR auth.uid() IS DISTINCT FROM p_auth_user_id THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT r.owner_id INTO v_owner FROM public.get_public_join_restaurant(p_slug) r;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Join link not found';
  END IF;

  SELECT id INTO v_id FROM public.restaurant_employees
   WHERE owner_id = v_owner AND auth_user_id = p_auth_user_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  v_first := NULLIF(TRIM(p_patch->>'first_name'), '');
  v_last  := NULLIF(TRIM(p_patch->>'last_name'), '');
  v_name  := COALESCE(NULLIF(TRIM(CONCAT_WS(' ', v_first, v_last)), ''), 'New team member');
  v_role  := COALESCE(NULLIF(TRIM(p_patch->>'primary_role'), ''), 'Server');

  INSERT INTO public.restaurant_employees (
    owner_id, auth_user_id, name, first_name, last_name, email, phone,
    primary_role, approved_roles, auto_approve_roles, availability,
    weekly_availability, emergency_contact, invited_at,
    onboarding_started, personal_info_complete, join_status, joined_via
  ) VALUES (
    v_owner, p_auth_user_id, v_name, v_first, v_last,
    NULLIF(TRIM(p_patch->>'email'), ''), NULLIF(TRIM(p_patch->>'phone'), ''),
    v_role, ARRAY[]::text[], ARRAY[]::text[], '',
    p_patch->'weekly_availability', p_patch->'emergency_contact', CURRENT_DATE,
    true, true, 'pending', 'join_link'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_restaurant_by_slug(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_restaurant_by_slug(text, uuid, jsonb) TO authenticated;

-- 8. Employees may never flip their own approval state
CREATE OR REPLACE FUNCTION public.enforce_employee_self_edit_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RETURN NEW;
  END IF;
  IF (caller = OLD.owner_id)
     OR public.can_manage_schedule_for(OLD.owner_id)
     OR public.can_manage_hiring_for(OLD.owner_id)
  THEN
    RETURN NEW;
  END IF;
  IF NEW.owner_id           IS DISTINCT FROM OLD.owner_id           THEN RAISE EXCEPTION 'Cannot change owner_id'; END IF;
  IF NEW.auth_user_id       IS DISTINCT FROM OLD.auth_user_id       THEN RAISE EXCEPTION 'Cannot change auth_user_id'; END IF;
  IF NEW.local_id           IS DISTINCT FROM OLD.local_id           THEN RAISE EXCEPTION 'Cannot change local_id'; END IF;
  IF NEW.position           IS DISTINCT FROM OLD.position           THEN RAISE EXCEPTION 'Cannot change position'; END IF;
  IF NEW.section            IS DISTINCT FROM OLD.section            THEN RAISE EXCEPTION 'Cannot change section'; END IF;
  IF NEW.primary_role       IS DISTINCT FROM OLD.primary_role       THEN RAISE EXCEPTION 'Cannot change primary_role'; END IF;
  IF NEW.approved_roles     IS DISTINCT FROM OLD.approved_roles     THEN RAISE EXCEPTION 'Cannot change approved_roles'; END IF;
  IF NEW.auto_approve_roles IS DISTINCT FROM OLD.auto_approve_roles THEN RAISE EXCEPTION 'Cannot change auto_approve_roles'; END IF;
  IF NEW.seniority          IS DISTINCT FROM OLD.seniority          THEN RAISE EXCEPTION 'Cannot change seniority'; END IF;
  IF NEW.join_status        IS DISTINCT FROM OLD.join_status        THEN RAISE EXCEPTION 'Cannot change join_status'; END IF;
  RETURN NEW;
END;
$$;

-- 9. Backfill slugs for existing named restaurants
DO $$
DECLARE r record; s text;
BEGIN
  FOR r IN SELECT id, restaurant_name FROM public.profiles
            WHERE role = 'owner' AND slug IS NULL
              AND COALESCE(NULLIF(TRIM(restaurant_name), ''), '') <> ''
            ORDER BY created_at
  LOOP
    s := public.allocate_restaurant_slug(r.restaurant_name, r.id);
    IF s IS NOT NULL THEN
      UPDATE public.profiles SET slug = s WHERE id = r.id;
    END IF;
  END LOOP;
END $$;