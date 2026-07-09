CREATE OR REPLACE FUNCTION public.slugify_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      trim(both '-' FROM
        regexp_replace(
          lower(coalesce(input, '')),
          '[^a-z0-9]+', '-', 'g'
        )
      ),
      ''
    ),
    'team'
  )
$$;

CREATE OR REPLACE FUNCTION public.search_restaurants(q text)
RETURNS TABLE(owner_id uuid, restaurant_name text, slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS owner_id,
    p.restaurant_name,
    public.slugify_name(p.restaurant_name) AS slug
  FROM public.profiles p
  WHERE p.role = 'owner'
    AND p.restaurant_name IS NOT NULL
    AND (
      COALESCE(NULLIF(TRIM(q), ''), '') = ''
      OR p.restaurant_name ILIKE '%' || TRIM(q) || '%'
    )
  ORDER BY
    CASE WHEN p.restaurant_name ILIKE TRIM(q) || '%' THEN 0 ELSE 1 END,
    p.restaurant_name
  LIMIT 20
$$;

GRANT EXECUTE ON FUNCTION public.search_restaurants(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.slugify_name(text) TO anon, authenticated;