# G1A — Production Identity + Consent Evidence v1

Date: 2026-11-02  
Branch: `codex/financial-refund-reliability`  
Production organization: Yogakulam Academy  
Production organization id: `3d9ef175-1624-4d89-a0bd-73d3f82c23c0`

## Status

**G1A is COMPLETE as a production-evidence gate.**

This checkpoint proves that identity linking and consent evidence are operating with real Yogakulam production data. It does **not** prove live payment-provider completion, and it does not resolve the two intentionally open identity conflicts.

No production data or schema was changed to collect this evidence. All production inspection was read-only.

## Consent evidence

Read-only production inspection found:

- `privacy_consent_receipts`: **1,646 Yogakulam rows**;
- `tracking_consent_events`: **95 Yogakulam rows**;
- all 95 tracking-consent rows are for `www.yogakulam.com`;
- all 95 were emitted by `yk_tracker`;
- all 95 record analytics consent as granted;
- no marketing/ad-user-data/ad-personalization grant is inferred from those 95 `yk_tracker` events.

The 95 live-site tracking-consent events occurred from:

- first: `2026-10-07 05:49:00.385+00`;
- last: `2026-10-07 08:53:46.397+00`.

The broader Yogakulam privacy-receipt ledger is active beyond that initial live-site tracking proof. At inspection time:

- analytics granted receipts: **1,574**;
- marketing granted receipts: **8**;
- advertising granted receipts: **8**;
- receipts linked to a canonical Person: **71**;
- receipts linked to an anonymous visitor: **1,575**.

`browser_sdk_v1` analytics-granted receipts continue through `2026-11-02 16:39:45.419+00`, and `identity_promotion_v1` analytics receipts continue through `2026-11-02 09:36:49.298+00`.

The production ledger also contains denied/opted-out decisions. Therefore this checkpoint does not treat the mere presence of a user/session as consent and does not collapse purpose-specific decisions into a global grant.

## Identity evidence

Read-only production inspection for Yogakulam found:

- canonical Persons: **710**;
- Person identifiers: **818**;
- Person ↔ Lead links: **687**;
- Person ↔ Session links: **99**;
- Visitor identity links: **56**;
- identity-resolution evaluations: **5,343**;
- identity-resolution conflicts: **2**;
- open conflicts: **2**.

Visitor-link provenance:

- `website`: **55** links, from `2026-09-26 02:04:11.778751+00` through `2026-11-02 14:54:32.222566+00`;
- `customer360-closeout-proof`: **1** controlled proof link.

This gives direct production evidence that anonymous website identity is being promoted/link-associated to CRM identity rather than remaining only a synthetic test path.

## Identity integrity health

`v_customer360_identity_integrity_health_v2` reported for Yogakulam:

- leads without Person: **0**;
- Person-link tenant mismatches: **0**;
- identifier tenant mismatches: **0**;
- session tenant mismatches: **0**;
- open conflicts: **2**;
- ambiguous isolations in the prior 24h: **0**.

The two open conflicts are not treated as a failure of deterministic identity linking. They remain intentionally isolated for human review under PA-1 rather than being auto-merged.

## Existing PA-1 boundary retained

The existing Human-Approved Identity Merge checkpoint remains authoritative for ambiguous conflicts:

- no probabilistic auto-merge;
- explicit manager/admin confirmation required;
- same-organization only;
- privacy/legal/ad-activation preflight fails closed;
- consent evidence is preserved during an approved merge;
- the two current production conflicts remain unresolved until a human explicitly decides they are the same person.

No merge was executed as part of G1A.

## Acceptance decision

G1A closes the previously broad "identity/consent evidence" portion of the launch gate because both sides now have real production evidence:

1. purpose-specific consent decisions are being persisted for real Yogakulam traffic;
2. anonymous website identity is being linked/promoted into canonical CRM identity;
3. tenant-integrity health is clean;
4. ambiguity is isolated instead of silently merged;
5. consent evidence survives/participates in the governed identity model.

## Not proven by G1A

G1A does **not** prove:

- PayPal payment completion in SalsysOS;
- ICICI payment completion in SalsysOS;
- Direct UPI verified-payment completion in SalsysOS;
- `enrollment.completed` from a real verified provider/admin payment;
- the full GT-01 commerce chain;
- resolution of the two open identity conflicts.

Those remain separate gates.

## Next gate

**G1B — Real Provider Completion Evidence**

Required evidence remains one controlled real verified payment path producing the authoritative chain:

`booking.completed -> payment.started -> payment.completed -> enrollment.completed`

with correct business amount, identity association, idempotent enrollment identity, revenue projection, Customer 360/funnel visibility and no new System Health failures.
