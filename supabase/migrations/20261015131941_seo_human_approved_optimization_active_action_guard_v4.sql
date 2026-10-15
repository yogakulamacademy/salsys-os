-- OG9 v4: prevent accidental duplicate active actions for the same experiment.
create unique index if not exists seo_optimization_actions_one_active_per_experiment_idx
  on public.seo_optimization_actions(organization_id, experiment_id)
  where approval_status in ('pending','approved') and execution_status <> 'rolled_back';
