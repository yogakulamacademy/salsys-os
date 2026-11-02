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
- Fail the whole command on audit failure or more than 1,000 scanned family records. Temporary authority is removed on success and rolled back on failure.
- At repeatable-read/serializable isolation, retry the whole transaction after serialization failure; do not reuse a stale allocation snapshot.

## Migration boundary

The first incremental migration adds the private command, protected authority table and strict guard exception. It does not rewrite historical payments or linked refunds. Its association index supports allocation identity checks.

The second migration transforms exactly one reviewed legacy association statement and one lead-lock anchor in the existing canonical enrollment processor. It requires the enrollment processor, dispatcher and private helper to have the same owner. Missing baseline, changed function shape or owner mismatch stops the migration before widening access. It does not introduce a parallel enrollment processor or publish a captured production function body.

The repository's missing full event/commerce migration baseline is still a rollout prerequisite. A reduced test adapter proves the transformation and command contract; it cannot prove fresh full-schema reproducibility. Inspect the actual processor ownership, ACLs, helper dependencies and surrounding triggers in staging before applying this migration chain. Do not apply to production or merge the draft merely because these subsystem tests pass.

## Validation and remaining acceptance

`npm run test:financial:db` runs the existing refund cases and the new association suite in disposable local PostgreSQL databases. It checks real independent-connection waits, immutable fields, failure rollback, trusted-processor permissions and the bounded command. Synthetic auth helpers read fixture claims; they do not issue or validate Supabase sessions.

Required remaining gates: a reviewed reproducible full processor baseline; real intake/provider and identity/consent integration; stale/conflicting provider payment/refund semantics; governed contractual adjustments; authoritative deposit/capacity enforcement; and the complete GT-01 replay without seeding its expected final state. Keep approved AI Knowledge, business content, Sales Assets and controlled conversation assistance critical. Growth views precede R13, and the user-withdrawn Home redesign stays withdrawn.
