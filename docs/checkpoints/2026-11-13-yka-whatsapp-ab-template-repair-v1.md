# Yogakulam WhatsApp A/B placeholder repair — review-only implementation

## Verified production snapshot
Recorded 2026-11-13, after sync at 11:13:41 UTC:
- Yogakulam WABA synchronized 16 templates, all marked approved/active/Marketing.
- All 16 bodies contain unrecognized dotted tokens: {{lead.first_name}} and {{course.name}}.
- Parameter schema reported body_variable_count=0, so approval does not establish that personalization will work.
- yka_ab_enquiry_a_v1 and yka_ab_enquiry_b_v1_ have **identical** body text. The second name includes a trailing underscore.
- An aggregate-only production query found **no** Yogakulam WhatsApp campaign records, so there are no existing A/B campaign assignments to preserve.

## Fix implemented in this PR
1. Pure audited parser: distinguishes supported positional Meta placeholders from malformed, dotted or named placeholders. Static bodies remain supported.
2. Meta sync records parameter_binding_supported, variable_syntax and validation_reason, without changing Meta approval status.
3. Growth campaign setup hides unsupported templates and rejects them again on the server.
4. **Crucial runtime guard:** the existing WhatsApp provider-send adapter verifies the synchronized template body and the exact number of values before any Meta HTTP request. This covers existing prepared audits/campaigns, not just UI selections.
5. Synthetic regression tests include dotted tokens, named tokens, non-contiguous indexes, missing values, malformed braces, valid static, valid header/body and parameter-count mismatch.
6. Everything is additive to existing safety; no migration, database writes, Meta submission, customer send, policy toggle or deployment.

## Meta action required
Create new versioned templates named yka_ab_*_v2 in Yogakulam WhatsApp Manager.
Use exactly {{1}} (verified customer first name) and {{2}} (verified course name), and supply fictional samples. Use category Marketing and language code en for parity with existing versions.
The old B enquiry version is identical to A, so give B a genuinely different question focused on whether the student needs fees, dates or certificate details. Keep two independent approved template IDs for the experiment.

Editing original templates is a possible alternative only if Meta permits changes, but versioning preserves clean experiment identity and avoids overwriting old copy. Do not send old dotted-token versions.

After Meta approval:
- SalsysOS -> Automation -> Templates -> Sync.
- Verify APPROVED, active, body_variable_count=2, parameter_binding_supported=true.
- In Growth, configure Control and Challenger with body.1=lead.first_name and body.2=course.name.
- Snapshot eligible opted-in leads and human-review; provider/messaging policies remain OFF until explicitly authorized one-recipient pilot.

## Outstanding acceptance
- Independent security review and CI/CodeQL.
- Real signed-in role/tenant acceptance; Meta approval and re-sync.
- Direct Meta send proof with human-authorized pilot; delivery, response and STOP suppression.
- Extend PR #702 verified composer mappings or use existing explicit Growth bindings for the new v2 templates.
- AI intent inference and uplift statistics are separate, not made true by this fix.
- Preserve R2/AI staging holds and existing production no-send controls; do not merge without release authorization.
