# SalsysOS architecture

## v0.2 data flow

```text
Browser
  ↓
Next.js App Router
  ↓ cookie-based Supabase Auth
Supabase Data API
  ↓
PostgreSQL + RLS
  ├─ Leads / Contacts
  ├─ Funnel History
  ├─ Tasks / Follow-ups
  ├─ Conversations / Messages
  ├─ Touchpoints / Attribution
  ├─ Payments / Enrollments
  └─ Courses / Batches
```

## Mutations

```text
Manual lead creation
  → create_crm_lead()

Stage change
  → set_lead_stage()
  → lead_stage_history

Schedule follow-up
  → create_followup_task()
  → tasks + leads.next_followup_at

Complete follow-up
  → complete_followup_task()
  → recalculate next open follow-up
```

## Planned ingestion layer

```text
Website / GTM ──┐
Instagram API ──┼→ Webhook / Tracking API → identity resolver → CRM
WhatsApp API  ──┘
```

## Planned AI layer

```text
Incoming event
  ↓
Rule engine
  ↓ if interpretation required
Claude router / skill
  ↓
MCP tools
  ↓
CRM source of truth
```

The AI layer will not own lead state. It will read and mutate the CRM through controlled tools so attribution and funnel history remain auditable.
