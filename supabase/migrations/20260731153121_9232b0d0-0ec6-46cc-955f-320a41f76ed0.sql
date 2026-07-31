-- 1) Lock down direct EXECUTE on internal/SECURITY DEFINER helpers.
-- Trigger-only helpers: never called directly.
REVOKE ALL ON FUNCTION public.apply_trade_shift_reassignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_employee_self_edit_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.slugify_name(text) FROM PUBLIC, anon;

-- RLS predicate helpers: needed by signed-in users only (policies evaluate as caller).
REVOKE ALL ON FUNCTION public.can_manage_hiring_for(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_schedule_for(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.employee_can_claim_role(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shift_is_on_trade_board(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_effective_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_employee_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_menu_bank_meta(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_restaurant_coworker_names(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_manage_hiring_for(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_schedule_for(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_can_claim_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shift_is_on_trade_board(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_bank_meta(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_coworker_names(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.slugify_name(text) TO authenticated;

-- Public applicant/invite flows: keep callable, but grant explicitly instead of via PUBLIC.
REVOKE ALL ON FUNCTION public.applicant_confirm_interview_slot(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.applicant_confirm_shadow_shift(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.applicant_decline_shadow_shift(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.host_complete_interview(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_interview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_shadow_shift(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_hire_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_employee_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_hire_invite(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_employee_invite(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_restaurants(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.applicant_confirm_interview_slot(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.applicant_confirm_shadow_shift(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.applicant_decline_shadow_shift(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.host_complete_interview(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_interview(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_shadow_shift(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_hire_invite(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_employee_invite(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_hire_invite(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_employee_invite(uuid, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_restaurants(text) TO anon, authenticated;

-- 2) Replace the always-true INSERT policy on job_applications with a constrained one.
DROP POLICY IF EXISTS "Anyone can submit an application" ON public.job_applications;

CREATE POLICY "Anyone can submit an application to an open posting"
ON public.job_applications
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_postings jp
    WHERE jp.id = job_applications.job_id
      AND jp.open = true
  )
  AND status = 'new'
  AND stage IS NULL
  AND verified = false
  AND archived = false
  AND hired_employee_id IS NULL
  AND interview_sent_at IS NULL
  AND interview_notes IS NULL
  AND selected_slot IS NULL
  AND offered_slots IS NULL
  AND shadow_shift IS NULL
  AND shadow_confirmed_at IS NULL
  AND ai_score IS NULL
);
