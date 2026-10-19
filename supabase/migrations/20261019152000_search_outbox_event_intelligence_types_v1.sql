begin;

alter table public.search_index_outbox
  drop constraint if exists search_index_outbox_entity_type_check;

alter table public.search_index_outbox
  add constraint search_index_outbox_entity_type_check
  check (entity_type = any (array[
    'lead'::text,
    'conversation'::text,
    'message'::text,
    'knowledge_chunk'::text,
    'person'::text,
    'seo_page'::text,
    'seo_topic'::text,
    'seo_entity'::text,
    'seo_experiment'::text,
    'seo_action'::text,
    'seo_competitor'::text,
    'seo_rank_target'::text,
    'seo_competitor_analysis'::text,
    'event_feature'::text,
    'event_prediction'::text
  ]));

commit;
