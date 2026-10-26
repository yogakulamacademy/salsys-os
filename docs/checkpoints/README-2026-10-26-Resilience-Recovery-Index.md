# 2026-10-26 Resilience Recovery Index

If work resumes after a chat/session interruption, use this order:

1. `docs/SalsysOS_Current_Checkpoint.md`
2. `docs/checkpoints/M-2026-10-26-Supabase-Incident-and-Durable-Event-Resilience-v1.md`
3. `docs/SalsysOS_Resilience_Principles.md`
4. `docs/durable-event-ingestion-v1.md`
5. PR #187 / merge commit `9409a658c5786ae4a6fa209d976c732f0c6de00d`
6. `docs/SalsysOS_North_Star_Product_Context.md`

Immediate continuation point:

- verify the production durable queue path with one controlled trusted event;
- re-prove `payment.started` end-to-end;
- then implement authoritative `payment.completed`;
- then `enrollment.completed`;
- then revenue/attribution reconciliation;
- then refunds.

Do not redesign the trusted ingestion architecture unless new production evidence demonstrates a defect.

Do not commit any trusted source secret.
