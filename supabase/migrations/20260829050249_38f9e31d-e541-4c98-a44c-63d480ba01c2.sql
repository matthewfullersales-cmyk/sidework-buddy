DROP FUNCTION IF EXISTS public.get_public_person_invite(uuid);

CREATE OR REPLACE FUNCTION public.get_public_person_invite(p_token uuid)
RETURNS TABLE(
  first_name text,
  last_name text,
  primary_role text,
  restaurant_name text,
  expired boolean,
  claimed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pe.first_name,
         pe.last_name,
         pe.primary_role,
         pr.restaurant_name,
         (pe.invite_expires_at IS NOT NULL AND pe.invite_expires_at < now()) AS expired,
         (pe.auth_user_id IS NOT NULL) AS claimed
  FROM public.people pe
  LEFT JOIN public.profiles pr ON pr.id = pe.owner_id
  WHERE p_token IS NOT NULL AND pe.invite_token = p_token
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_public_person_invite(uuid) TO anon, authenticated;