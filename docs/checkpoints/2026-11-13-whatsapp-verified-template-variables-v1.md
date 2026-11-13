# WhatsApp verified template variables — V1 review checkpoint (2026-11-13)

## Purpose
Use existing SalsysOS WhatsApp Template Studio and approved Meta WABA templates.
Introduce a deterministic, tenant-scoped, preview-only variable resolution flow
for the first Yogakulam marketing follow-up templates.

## Changes on the feature branch
- Explicit template-name and position-to-field mappings, with wording/placeholder
  verification so a changed template cannot silently change variable meaning.
- Authenticated POST preview route at /api/conversations/[leadId]/template-variables:
  rechecks can_work_lead, current workspace, tenant-scoped lead, live course
  record, and current Meta approval. Returns preview only.
- Existing Conversations WhatsApp composer gets Fill verified CRM fields,
  personalized preview, and editable suggested fields. A human still clicks Send.
- Build includes deterministic tests. No new SQL migration, provider submission,
  customer message, cron or AI automatic reply has been added.

## Rollout guard
WA_TEMPLATE_VARIABLE_RESOLVER_ENABLED=true is a separate server-side feature
gate. OFF by default. Both preview route and composer UI are gated.
Do not enable in production without explicit release approval.
Existing send paths, Template Studio and AI gates are unchanged.

## V1 mapped templates and verified sources
- yka_course_enquiry_received_v1: lead first name, active linked course name
- yka_course_details_followup_v1: lead first name, active linked course name
- yka_preferred_month_checkin_v1: lead first name, active linked course name, CRM preferred month
- yka_course_mode_choice_v1: lead first name, active linked course name
- yka_batch_options_available_v1: lead first name, active linked course name
- yka_accommodation_query_followup_v1: lead first name, active linked course name
- yka_decision_support_v1: lead first name, active linked course name
- yka_course_followup_v1: lead first name, active linked course name

These are reviewed source mappings, NOT claims of Meta approval. Runtime
independently verifies Meta WABA approval and exact template semantics.
First-customer mappings live in code until a reviewed tenant-owned mapping
registry is introduced.

## V1 exclusions
- No automatically populated Utility amounts, payment records, enrollment,
  due dates, travel pickups or schedule changes without verified operational
  and transactional records.
- Unknown templates, named variables, media headers, dynamic URL buttons,
  changed text, missing names/courses/months.
- No automatic marketing outreach, opt-in inference, or AI-generated values.

## Acceptance gates
1. Run new deterministic tests, typecheck, build, and existing WhatsApp checks.
2. Test signed-in owner, assigned employee, unassigned employee, revoked user.
3. Test cross-tenant isolation and template unapproval/revision.
4. Verify explicit human confirmation, zero preview sends and zero writes.
5. Review opt-in, opt-out, suppression and provider send eligibility separately.
6. Obtain independent security review and owner approval before any enablement.
7. Maintain R2 staging freeze (#531), AI staging hold, no merges or deployments.

## Status
Unmerged draft code; independent signed-user staging evidence pending.
No Meta templates were submitted, approved or sent by this change.
