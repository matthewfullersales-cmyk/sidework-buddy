CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, restaurant_name)
  VALUES (
    NEW.id,
    CASE WHEN NEW.raw_user_meta_data->>'role' = 'owner'
         THEN 'owner'::public.user_role
         ELSE 'employee'::public.user_role END,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'restaurant_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, role, full_name, restaurant_name)
SELECT
  u.id,
  CASE WHEN u.raw_user_meta_data->>'role' = 'owner'
       THEN 'owner'::public.user_role
       ELSE 'employee'::public.user_role END,
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  u.raw_user_meta_data->>'restaurant_name'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;