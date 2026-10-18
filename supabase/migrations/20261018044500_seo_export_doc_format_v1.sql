-- Allow the export ledger to describe the file format actually returned to users.
alter table public.seo_intelligence_exports
  drop constraint if exists seo_intelligence_exports_format_check;

alter table public.seo_intelligence_exports
  add constraint seo_intelligence_exports_format_check
  check (format in ('csv','pdf','doc','docx'));
