DROP INDEX IF EXISTS public.restaurant_employees_owner_local_id_key;
CREATE UNIQUE INDEX restaurant_employees_owner_local_id_key
ON public.restaurant_employees (owner_id, local_id);