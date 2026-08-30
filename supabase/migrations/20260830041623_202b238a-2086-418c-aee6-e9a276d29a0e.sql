ALTER TABLE public.push_subscriptions DROP CONSTRAINT push_subscriptions_employee_id_fkey;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.people(id) ON DELETE CASCADE;

ALTER TABLE public.employee_notifications DROP CONSTRAINT employee_notifications_employee_id_fkey;
ALTER TABLE public.employee_notifications ADD CONSTRAINT employee_notifications_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.people(id) ON DELETE CASCADE;

ALTER TABLE public.training_progress DROP CONSTRAINT training_progress_employee_id_fkey;
ALTER TABLE public.training_progress ADD CONSTRAINT training_progress_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.people(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_attempts DROP CONSTRAINT quiz_attempts_employee_id_fkey;
ALTER TABLE public.quiz_attempts ADD CONSTRAINT quiz_attempts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.people(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.employee_can_claim_role(p_owner_id uuid, p_role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.people e
    WHERE e.auth_user_id = auth.uid()
      AND e.owner_id = p_owner_id
      AND e.state IN ('hired','active','inactive','pending_approval')
      AND e.archived = false
      AND p_role = ANY(COALESCE(e.approved_roles, ARRAY[]::text[]))
  )
$function$;