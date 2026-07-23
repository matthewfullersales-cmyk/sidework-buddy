
-- Menu bank versioning: bump on every menu regeneration, stamp on each
-- passing employee attempt. Employees whose passing attempt is stamped with
-- an older version are treated as not-passed and re-blocked from scheduling
-- until they retake against the current menu.

ALTER TABLE public.menu_quiz_banks
  ADD COLUMN IF NOT EXISTS bank_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.training_progress
  ADD COLUMN IF NOT EXISTS bank_version integer;

-- Any existing menu-quiz passes are backfilled to version 1 so they align
-- with the initial bank_version until the owner regenerates.
UPDATE public.training_progress
SET bank_version = 1
WHERE video_id = 'menu-quiz' AND bank_version IS NULL;

-- Allow employees to read their restaurant's current menu bank version so
-- the client can tell "never taken" apart from "stale after menu update".
-- Only expose the version + updated_at, never the questions/answers.
CREATE OR REPLACE FUNCTION public.get_menu_bank_meta(p_owner_id uuid)
RETURNS TABLE (bank_version integer, updated_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.bank_version, b.updated_at
  FROM public.menu_quiz_banks b
  WHERE b.owner_id = p_owner_id
    AND (
      auth.uid() = p_owner_id
      OR EXISTS (
        SELECT 1 FROM public.restaurant_employees e
        WHERE e.owner_id = p_owner_id AND e.auth_user_id = auth.uid()
      )
    )
$$;

REVOKE ALL ON FUNCTION public.get_menu_bank_meta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_menu_bank_meta(uuid) TO authenticated;
