-- Leads list (owner-approved mockup, 20 Nov 2026): two more quick views.
--   qualified_up : Qualified, High intent, Payment pending, Won, Enrolled
--   set_aside    : Not now and Lost
-- Read-only change to the list functions (approved: read-only function changes).
-- Patches the live definitions so nothing else in them changes.
do $$
declare
  fn text;
  def text;
begin
  foreach fn in array array[
    'public.get_leads_workspace_page_v2(uuid,integer,integer,text,text,text,text,text,text,text,text,text)',
    'public.get_leads_workspace_page_v3(uuid,integer,integer,text,text,text,text,text,text,text,text,text,text,text)'
  ] loop
    def := pg_get_functiondef(fn::regprocedure);
    if position('qualified_up' in def) > 0 then
      continue;
    end if;
    def := replace(def,
      $a$when p_quick_view in ('all','unassigned','stuck','followup_overdue','payment_pending')$a$,
      $a$when p_quick_view in ('all','unassigned','stuck','followup_overdue','payment_pending','qualified_up','set_aside')$a$);
    def := replace(def,
      $a$or (p.quick_view = 'payment_pending' and b.current_stage = 'payment_pending')$a$,
      $a$or (p.quick_view = 'payment_pending' and b.current_stage = 'payment_pending')
      or (p.quick_view = 'qualified_up' and b.current_stage::text in ('qualified','high_intent','payment_pending','closed_won','enrolled'))
      or (p.quick_view = 'set_aside' and b.current_stage::text in ('not_now','lost'))$a$);
    if position('qualified_up' in def) = 0 or position($a$p.quick_view = 'set_aside'$a$ in def) = 0 then
      raise exception 'Leads view patch did not apply to %', fn;
    end if;
    execute def;
  end loop;
end $$;
