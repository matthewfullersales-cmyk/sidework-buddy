
ALTER TABLE public.restaurant_team_members
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

UPDATE public.restaurant_team_members
SET first_name = COALESCE(NULLIF(TRIM(split_part(name, ' ', 1)), ''), name),
    last_name = NULLIF(TRIM(SUBSTRING(name FROM POSITION(' ' IN name) + 1)), '')
WHERE first_name IS NULL AND last_name IS NULL;

CREATE OR REPLACE FUNCTION public.sync_team_member_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL THEN
    NEW.name := NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(NEW.first_name), ''), NULLIF(TRIM(NEW.last_name), ''))), '');
    IF NEW.name IS NULL THEN
      NEW.name := COALESCE(OLD.name, '');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_team_member_name ON public.restaurant_team_members;
CREATE TRIGGER trg_sync_team_member_name
BEFORE INSERT OR UPDATE ON public.restaurant_team_members
FOR EACH ROW EXECUTE FUNCTION public.sync_team_member_name();
