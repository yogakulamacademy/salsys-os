# SalsysOS — Historical Conversation Learning Engine

**Version:** 0.1 · Proposed, documentation-only · 2026-11-11  
**Parent:** [Competitor-informed roadmap #696](https://github.com/yogakulamacademy/salsys-os/issues/696)  
**Roadmap:** R3/R4/R6/R7/R10/R11/R13. No new R phase or release approval.

## Objective

Use permitted historic CRM, WhatsApp and Instagram sales conversations to improve staff-approved responses, qualification questions, objection handling, next-best-actions and follow-ups. Differentiate through verified revenue and outcome learning. **Never blindly train an LLM on raw old messages.** Past conversations may contain incorrect advice, outdated pricing and sensitive information.

## Three separate learning layers

1. **Current facts (approved KB + structured CRM):** current dates, prices, package details, policies, trusted payment/enrollment status. Historical chats are not authority for present facts.
2. **Sales strategy examples (RAG):** a small, tenant-only collection of human-reviewed, redacted examples that illustrate useful questions, objection strategies and escalation. Retrieved examples condition an existing model; they do not modify its weights.
3. **Outcomes + evaluation:** tag intent, objections, missing qualification fields and staff actions, reconcile with actual trusted conversion/payment evidence, let staff label good/bad examples and measure improvements against held-out tests.

True model fine-tuning is an optional, independent later decision only if the chosen model/provider supports it and legal restrictions permit its exact purpose. Claude public API did not provide standard self-service fine-tuning; OpenAI announced existing fine-tuning access wind-down for new customers in May 2026. Recheck before procurement.

## Sources and provenance

Start with **read-only inventory**, not bulk extraction:
- SalsysOS already-authorized conversation messages, lead stages, tasks and trusted payment events.
- Permitted previous CRM exports and opt-in WhatsApp Business chat exports.
- Official WhatsApp Business coexistence migration history where actually available; ordinary WhatsApp Cloud API is not a general lifetime chat-history search.
- Instagram professional-account conversations through approved Meta APIs where allowed; message access can be incomplete and permission-limited.
- Human-written sales policies and approved response examples.

Required source metadata: organization, conversation ID, message IDs, channel, original timestamps, import provenance, lawful processing purpose, permission/suppression state, staff reviewer, source version, expiry and deletion status. Do not merge people based only on similar names. Avoid scraping or unofficial bypasses.

## Privacy and WhatsApp contract blocker

Meta's **WhatsApp Business Solution Terms** restrict Business Solution Data (including de-identified, anonymous, aggregate or derived forms) from being used to develop/train/improve AI models. The terms contain a narrow exception for fine-tuning an AI model **for the business's exclusive use**, provided the data is not used to train or improve other models. Therefore, **do not build a cross-tenant general SalsysOS foundation model trained on WhatsApp customer conversations**. This exception is not blanket authorization; independent legal/privacy/processor review remains mandatory, and other channel policies must be considered separately.

Historic sales consent or permission to send messages does not automatically authorize model training. Define and approve purpose, processing notice, cross-border processor handling, access controls, data retention and erasure under applicable laws (including India's phased DPDP implementation and relevant overseas privacy frameworks). Do not bulk-upload raw archives to a model provider without approved conditions. Keep customer-specific examples/embeddings/cache within the individual tenant. Support opt-out and deletion propagation throughout source, extracts, vectors, evals and caches. Do not train where revocation/erasure obligations cannot be met.

Redact unnecessary names, contact details, emails, addresses, passport/ID data, payment credentials, medical/sensitive narratives, attachments and secrets. Simply replacing a name is not guaranteed anonymization. Keep source archive and any allowed embeddings encrypted and least-privilege; do not store raw chats in GitHub or ordinary logs. Check limitations on reusing model-generated outputs as downstream model-training examples.

Official references:
- https://www.whatsapp.com/legal/business-solution-terms/
- https://whatsappbusiness.com/policy/
- https://platform.claude.com/docs/en/about-claude/glossary
- https://openai.com/index/introducing-improvements-to-the-fine-tuning-api-and-expanding-our-custom-models-program/
- https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a
- https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014

## Proposed processing pipeline

Permissioned source inventory → isolated read-only import ledger → exact conversation matching and deduplication → rights/purpose filters → safe PII redaction → segmentation and objection/intent extraction → verified commerce/outcome reconciliation → human adjudication → tenant-only approved examples/playbooks and isolated evaluation datasets → shadow-mode retrieval → monitored, authorized production pilot.

Do not build a separate global chat warehouse or duplicate the existing Co-Pilot/Knowledge Builder. Reuse the current organization-scoped lead-context and AI evaluation primitives after auditing their data boundaries.

## Example label contract

For each approved example, capture (where supported):
- source channel and stable source message IDs, tenant ID
- product interest, mode, preferred date, qualification gaps
- intent label with evidence and uncertainty; objection category
- staff action and response style, follow-up and human takeover
- outcome: unknown, re-engaged, stage changed, verified deposit or enrolled based on **trusted commerce records only**
- reviewer verdict (approved, corrected, rejected), review reason and version
- legal purpose, retention limit, source deletion status and source provenance

**Bad examples:** record inaccurate/harmful previous staff messages as negative evaluation cases only when permitted; never promote them into positive training targets. The fact a lead later booked does not mean the earlier message caused it.

## Implementation checkpoints after the existing AI/R2 reviews

**HL-00 — Permission & inventory, read-only.** Count eligible historic conversations by channel, date, quality, known outcome and lawful use. Confirm whether old messages are actually available via the CRM/provider/export. Verify current Knowledge Builder, Co-Pilot and data retention gates. Do not call an external model or export customer text yet.

**HL-01 — Private curated pilot.** Select a representative *approved* small sample of successful and unsuccessful sales conversations. Provisional investigation size: 200–500 candidate conversations, not a requirement or completed dataset. Review and redact; preserve unknown outcomes; obtain staff approval. Split training/exemplar material and held-out test conversations by lead/person/time to avoid leakage.

**HL-02 — Reusable tenant-approved sales examples.** Build a rights-aware store of versioned approved objection-handling and qualification strategies with citations, never raw unrestricted chat retrieval. Current CRM and approved KB facts always override old chats. Add revocation and exclusion controls.

**HL-03 — Shadow-mode evaluation.** Compare current approved Co-Pilot behaviour against retrieval-augmented draft behaviour. Test extraction, usefulness, error rate, contradictory current prices, unsupported financial commitments, false high-intent classification, sensitive escalation, prompt injection, tenant boundaries, latency and cost. Staff review all outputs; no automated sends.

**HL-04 — Controlled feedback loop.** Explicit reviewer feedback and approved example/playbook revisions. No automatic overnight model retraining. Store source, review, system prompt/routing version and outcomes. Defer true fine-tuning pending measured need, provider availability and independent privacy/WhatsApp terms review.

**HL-05 — Verified outcome learning.** When R2 and trusted payment/enrollment events are accepted, compare actual qualified-to-paid and lead-to-enrollment outcomes through a careful controlled pilot. Do not declare causal improvement from simple before/after charts or fabricate ROI.

## Acceptance

- Zero cross-tenant history, embeddings, or exemplar access; all access role-checked.
- Zero source data without documented use permission; no shared training from WhatsApp Business Solution Data.
- Deletion/withdrawal removes retrievable derivatives in approved data stores.
- All financial confirmations trace to trusted payments, not chat text.
- Current approved policy, course schedule and pricing prevail over historical examples.
- Negative examples never become training targets; test set has no duplicates.
- Human takeover, channel window/consent policies, provider calls and all sends remain governed by existing gates.
- Reviewer decisions, corrections, costs, prompt versions and metrics are recorded; no false efficacy claims.

**Next exact step:** After current reviews, perform an authorized read-only inventory and lawful-use assessment of old chat sources, then define one narrowly scoped curated pilot. No implementation, import, provider activation, model fine-tuning or customer-data write is authorized by this document.
