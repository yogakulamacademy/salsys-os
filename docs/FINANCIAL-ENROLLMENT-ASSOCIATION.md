# Late enrollment association after refunds

This extends the draft refund reliability work. It changes no production data or UI and must not be treated as full financial or enrollment acceptance.

## Problem and behavior

The refund ledger guard previously rejected the late association performed when enrollment arrived after a payment and refund. Allowing unrestricted enrollment edits would weaken allocation history. The new internal command instead associates matching existing original payments and all of their linked refunds with the same enrollment, in one audited transaction. Amount, currency, payment status, original/refund identity, request bindings and other record content stay unchanged.

The command is private to owner-owned trusted processors. Public, anonymous, authenticated and service API roles cannot call it directly or create its temporary authority. The existing server-side dispatcher/enrollment entry points are restricted to the service role; current application call sites use the server's admin client. This does not authorize autonomous messaging or new cash movement.

## Invariants

- Validate tenant, lead and enrollment; require matching recorded booking/raw-event evidence. This is an association proof from the trusted processor, not independent provider payment verification or identity consent.
- Lock the lead before enrollment and payment rows, matching the refund/verification lock order. The processor takes this first lock before its enrollment upsert.
- Allow only a null-to-enrollment association through a protected per-transaction/per-connection authority row. A custom session setting cannot forge it. The guard compares the entire payment record except enrollment and update timestamp.
- Associate original payments before their refunds and reject any preexisting conflicting enrollment, tenant, lead or currency allocation. Payment and enrollment currencies must match; no exchange rate is inferred. Existing unlinked settled refunds in the matching currencies require reconciliation first. Do not silently move or infer an unrelated refund.
- Keep linked financial fields immutable. Protect a refunded original's booking reference and prevent an allocated enrollment's ID, tenant, lead, currency or booking reference from changing or its record from being deleted.
- Replays add no audit or financial records. New refunds inherit their original's enrollment through the existing canonical refund command.
- A later provider replay may refresh non-financial evidence when the payment facts are unchanged. It must not change amount, currency, provider/reference, paid state, payment kind or another protected financial field after a refund. Conflicting provider facts fail rather than silently rewriting settled history.
- Fail the whole command on audit failure or more than 1,000 scanned family records. Temporary authority is removed on success and rolled back on failure.
- At repeatable-read/serializable isolation, retry the whole transaction after serialization failure; do not reuse a stale allocation snapshot.

## Migration boundary

The first incremental migration adds the private command, protected authority table and strict guard exception. It does not rewrite historical payments or linked refunds. Its association index supports allocation identity checks.

The second migration transforms exactly one reviewed legacy association statement and one lead-lock anchor in the existing canonical enrollment processor. It requires the enrollment processor, dispatcher and private helper to have the same owner. Missing baseline, changed function shape or owner mismatch stops the migration before widening access. It does not introduce a parallel enrollment processor.

## Recovered production processor provenance

The applied processor source was traced read-only to the authoritative Supabase migration ledger entry `20261019154130 / event_lifecycle_projection_v1`. That ledger statement is 35,391 bytes with MD5 `79b3de6661e0551f862bdbd4750d41b6`.

The two deployed definitions relevant to this patch were captured verbatim into repository test fixtures:

- `tests/database/process-enrollment-raw-event-v1.production-baseline.sql` — 8,799 bytes, MD5 `4ba0b10a80e0c205a3f6cc07bffa7c16`;
- `tests/database/process-tracking-raw-event-v1.production-baseline.sql` — 4,479 bytes, MD5 `6fa37e3bfe601ed724263c05d7678e39`.

Live readback also confirmed both functions are owned by `postgres`, are `SECURITY DEFINER`, deny anonymous/authenticated execution and grant execution to `service_role`. The application durable-event path calls the dispatcher through the server-side admin client.

`tests/readiness/financial-processor-baseline.test.cjs` checks the captured byte/hash identity and applies the reviewed source transformation to the complete deployed enrollment definition, while the independent PostgreSQL suite still uses a reduced executable adapter for transactional behavior. This closes the previous source-provenance ambiguity around the processor body; it still does not equal a clean full-schema restore from every historical migration.

No #440 migration has been applied to production. The four draft migration versions remain absent from the production migration ledger and their new columns/functions/tables remain absent from the live schema.

## Validation and remaining acceptance

`npm run test:financial:db` runs the refund, association and provider-replay cases in disposable local PostgreSQL databases. It checks real independent-connection waits, immutable fields, failure rollback, trusted-processor permissions, the bounded association command, same-facts provider replay and rejection of conflicting provider rewrites. Synthetic auth helpers read fixture claims; they do not issue or validate Supabase sessions.

`npm run test:readiness` includes the production-processor source/provenance checks. Passing subsystem tests do not certify provider delivery, real identity/consent, full-schema compatibility, contractual adjustments or authoritative enrollment/capacity policy.

Required remaining gates: real intake/provider plus identity/consent integration; governed contractual adjustments; authoritative deposit/capacity enforcement; and the complete GT-01 replay without seeding its expected final state. A clean full-history schema reproduction should remain a separate migration-history quality task rather than being silently inferred from the captured processor snapshots. Keep approved AI Knowledge, business content, Sales Assets and the controlled autonomous Conversation Agent critical. Growth views precede R13, and the user-withdrawn Home redesign stays withdrawn.
