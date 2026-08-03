CREATE UNIQUE INDEX IF NOT EXISTS restaurant_employees_owner_local_id_key
ON public.restaurant_employees (owner_id, local_id)
WHERE local_id IS NOT NULL;