# SalsysOS WhatsApp / Deskcomm — isolated staging acceptance

**Status: NOT executed against a live Meta test number.** This is an
operator-assisted test plan. PR #718 is merged and the code is deployed with
handoff actions OFF; the new database handoff migration has **not** been applied
to production. Production and recovery rehearsal
are not substitute staging targets. Do not turn on production sends or this
feature until an independently approved, isolated staging organization,
Supabase project, Meta test sender, app secret, and reviewer are available.

## Prerequisites and safe activation

1. Create or explicitly approve a disposable, tenant-isolated **staging**
   SalsysOS + Supabase project. Do not reuse SalsysOS Production, Recovery
   Rehearsal or a live customer phone number. Keep all customer data synthetic.
2. Configure the dedicated Meta test WABA/phone number and webhook endpoint in
   that isolated environment, with its own `WA_APP_SECRET`, `WA_VERIFY_TOKEN`,
   app credentials and webhook subscriptions. Never copy production credentials
   into CI logs, test fixtures or GitHub issues.
3. Deploy only the reviewed branch to staging and run the full migration replay,
   CodeQL, build and disposable PostgreSQL tests. Verify signed webhook
   processing, one canonical tenant binding and the source message ledger.
4. Keep `SALSYS_DESKCOMM_INBOUND_SHADOW=false` and
   `SALSYS_DESKCOMM_HANDOFF_ACTIONS=false` until the on-site test operator
   approves activation; then enable only on isolated staging and explicitly
   provision a pilot-control row with `actions_enabled=true` for the **single**
   test organization using an approved DBA/service-role procedure.
5. Keep Meta provider sending independently OFF unless an authorized
   purpose-specific send test is approved. Human review is not send authority.
   The default sender stays the official Meta Cloud API, not a WAHA QR session.

## Acceptance cases and evidence

| ID | Test | Must observe |
| --- | --- | --- |
| W1 | Genuine Meta webhook signed with the test app secret | HMAC passes before tenant resolution; exactly one canonical inbound event and message; correct test sender |
| W2 | Missing/invalid signature on same body | HTTP 401, no new CRM/raw event |
| W3 | Unmapped test phone-number ID | Fail closed; no cross-tenant lead or message |
| W4 | Deliver identical Meta event twice | One canonical event and CRM message; duplicate count or no-op retry |
| W5 | Send direct `DATES`, month name, `STOP`, explicit human request | Only shadow intent candidates; no automated reply; existing consent/opt-out controls remain authoritative |
| W6 | Select an active Sales lead owner, manager or admin for a human-review request | One assigned task, one recipient-only bell alert, link to authorized conversation, no customer send |
| W7 | Try different-tenant user or an ordinary Sales member who does not own this lead | No task assignment; no unauthorized lead access or alert |
| W8 | Retry claim and open twice concurrently | Exactly one handoff, task and alert; same original identifiers returned |
| W9 | Activate handoff when an audit is already `sending` | Refusal with `whatsapp_provider_send_in_flight`; no new task; operator reconciliation needed |
| W10 | Transition a Meta send to `sending` after active handoff | Database trigger blocks standard and broadcast claims before network request |
| W11 | Intentionally sever the **test Meta transport** after request dispatch and before response | Audit retained in `sending`; `provider_response.transport_outcome.status=unknown`; review-only `/automation/whatsapp/uncertain-sends` displays the exact tenant-scoped audit within 30 days; retry blocked pending independent proof; do not assert message was unsent |
| W12 | Attempt to change unknown-outcome audit to failed/ready | Trigger blocks unsafe retry transition |
| W13 | Resolve assigned task, then explicitly release the hold | Closure preserves hold; release permits only future workflow evaluation, never replays cancelled jobs |
| W14 | Disable the pilot after creating a hold | New actions vanish; existing hold remains protected and visible for controlled resolution |
| W15 | Assigned staff clicks Dismiss alert | Only their own unread alert is acknowledged, not their colleague's; no CRM task completion or outbound message |
| W16 | Open/close from two authorized tenants | No identity, task, hold, alert or sender leakage across tenants |

Evidence must include the **staging project reference (redacted)**, exact
GitHub SHA and workflow checks, test-case IDs, anonymized raw-event IDs,
canonical message count, audit status transitions, task/alert identifiers,
source Meta test-number mapping, observed times, reviewer names and signed
release/rollback decisions. Never paste tokens, customer phone numbers, raw
WhatsApp message bodies or unrelated production records into the evidence.

## Meta transport ambiguity and operator reconciliation

An HTTP timeout after dispatch does **not** prove that Meta rejected the
message. Do not retry an unknown-outcome audit solely because the webhook has
not appeared. The current client preserves `status=sending` with an
`outcome_unknown` marker, and the audit trigger blocks conversion to a
retryable failure. Check Meta's response history, any corresponding accepted
provider message ID and authentic signed delivery receipts. If acceptance is
verified, use the existing provider-acceptance reconciliation controls to
attach the provider ID and canonical message without another send. If no
positive rejection/acceptance proof exists, keep the audit in investigation.

The operator-only `/automation/whatsapp/uncertain-sends` page lists up to
50 oldest matching Meta send audits from the last 30 days, with a lead link
and the last recorded audit time. This is a **read-only, bounded view**, not
an exact count, a provider-status verification, a production migration
check, a replay facility, or evidence of successful reconciliation. A
failure to read the audit table must be shown as unavailable, never as zero.

The handoff opening RPC refuses the lead while an audit is in `sending`.
Do not change `sending` to `failed` as a shortcut. This deliberately favors
an operator escalation over an accidental duplicate customer message.

## Rollback and release gate

- Turn both server pilot flags OFF, and set the specific staging
  `whatsapp_handoff_pilot_controls.actions_enabled` to false through the
  authorized DBA process. Do not bulk-delete handoff or alert history.
- Existing active holds remain effective. Staff can still use authorized
  close/release RPCs in a controlled recovery procedure; the UI hides writes
  when pilot flags are OFF.
- Confirm no paused enrollment, scheduled job or old approval was replayed.
  Confirm no unexpectedly accepted Meta message needs reconciliation.
- Production merge/deploy requires independent security + privacy review,
  successful W1–W16 witnessed evidence, owner sign-off, staging rollback
  rehearsal and an explicit written cutover decision. No evidence, no cutover.
