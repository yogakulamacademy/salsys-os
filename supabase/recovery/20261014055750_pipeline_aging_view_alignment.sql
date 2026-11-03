begin;

-- CI-only historical boundary repair.
-- The earlier cold-recovery compatibility baseline reconstructs
-- v_pipeline_stage_aging with unconstrained numeric threshold columns, while
-- the authoritative 20261014055802 migration recreates those outputs as
-- numeric(8,2). PostgreSQL CREATE OR REPLACE VIEW cannot change an existing
-- view column type, so remove only this compatibility view immediately before
-- the authoritative migration recreates it.
--
-- Production is not affected; this file is staged only inside Migration Replay.

drop view if exists public.v_pipeline_stage_aging;

commit;
