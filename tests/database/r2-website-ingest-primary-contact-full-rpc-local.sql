-- R2 #643 full function test on disposable LOCAL Supabase migration replay only.
-- NOT a production migration; every fixture row is removed via ROLLBACK.
-- No real customer information, site domain, outbound action, or credential.
\set ON_ERROR_STOP on
\echo 'R2 #643: full tenant-bound website lead ingestion test (disposable local Postgres)'
BEGIN;

INSERT INTO public.organizations (id,name,slug,status) VALUES
 ('00000000-0000-4000-8000-000000000643'::uuid,'R2 Local Contact A','r2-local-contact-primary-a','active'),
 ('00000000-0000-4000-8000-000000000644'::uuid,'R2 Local Contact B','r2-local-contact-primary-b','active');

INSERT INTO public.organization_sites (organization_id,hostname,status,environment) VALUES
 ('00000000-0000-4000-8000-000000000643'::uuid,'r2-contact-a.invalid','active','staging'),
 ('00000000-0000-4000-8000-000000000644'::uuid,'r2-contact-b.invalid','active','staging');

DO $r2_full_ingest$
DECLARE
  tenant_a uuid := '00000000-0000-4000-8000-000000000643'::uuid;
  tenant_b uuid := '00000000-0000-4000-8000-000000000644'::uuid;
  result jsonb;
  id_email uuid;
  id_phone uuid;
  id_b uuid;
  n int;
  p int;
  denied boolean;
BEGIN
  -- First email + phone: a brand-new lead, both normalized contacts.
  result := public.ingest_website_lead_for_organization(
    p_organization_id=>tenant_a, p_external_event_id=>'r2-643-a-initial',
    p_site=>'r2-contact-a.invalid', p_form_name=>'synthetic',
    p_first_name=>'Synthetic', p_last_name=>'Only',
    p_email=>'first643@example.invalid', p_phone=>'+910000006430');
  IF result->>'ok' IS DISTINCT FROM 'true'
      OR result->>'duplicate_event' IS NOT DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'R2 #643: first tenant-A lead ingest failed';
  END IF;
  id_email := (result->>'lead_id')::uuid;
  IF id_email IS NULL THEN
    RAISE EXCEPTION 'R2 #643: first lead id missing';
  END IF;
  SELECT count(*)::int, count(*) filter(where is_primary)::int INTO n,p
  FROM public.lead_contacts
  WHERE organization_id=tenant_a AND lead_id=id_email AND contact_type='email';
  IF n<>1 OR p<>1 THEN
    RAISE EXCEPTION 'R2 #643: first email should be sole primary';
  END IF;

  -- Returning lead is matched by existing phone, but supplies a NEW email.
  -- Prior function raised 23505; guarded version must retain first primary.
  result := public.ingest_website_lead_for_organization(
    p_organization_id=>tenant_a, p_external_event_id=>'r2-643-a-email-two',
    p_site=>'r2-contact-a.invalid', p_form_name=>'synthetic',
    p_email=>'second643@example.invalid', p_phone=>'+910000006430');
  IF (result->>'lead_id')::uuid IS DISTINCT FROM id_email
      OR result->>'matched_existing' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'R2 #643: returning lead resolved to a wrong identity';
  END IF;
  SELECT count(*)::int,count(*) filter(where is_primary)::int INTO n,p
  FROM public.lead_contacts
  WHERE organization_id=tenant_a AND lead_id=id_email AND contact_type='email';
  IF n<>2 OR p<>1
    OR NOT EXISTS (
      SELECT 1 FROM public.lead_contacts
      WHERE organization_id=tenant_a AND lead_id=id_email
        AND contact_type='email' AND normalized_value='first643@example.invalid'
        AND is_primary=true
    ) THEN
    RAISE EXCEPTION 'R2 #643: second email should remain nonprimary';
  END IF;

  -- Same event ID is idempotent, not a third contact or third receipt.
  result := public.ingest_website_lead_for_organization(
    p_organization_id=>tenant_a, p_external_event_id=>'r2-643-a-email-two',
    p_site=>'r2-contact-a.invalid', p_form_name=>'synthetic',
    p_email=>'second643@example.invalid', p_phone=>'+910000006430');
  IF result->>'duplicate_event' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'R2 #643: exact event replay was not deduplicated';
  END IF;
  SELECT count(*)::int INTO n FROM public.lead_ingest_events
   WHERE organization_id=tenant_a AND external_event_id='r2-643-a-email-two'
     AND source_system='website';
  IF n<>1 THEN
    RAISE EXCEPTION 'R2 #643: duplicate event receipt count changed';
  END IF;

  -- Create a phone-only lead and link an additional *different* WhatsApp
  -- contact to that SAME lead. The canonical old resolver also matches
  -- WhatsApp values for incoming phone, so second inbound no-email phone
  -- resolves an existing lead and tries to add a second primary phone.
  result := public.ingest_website_lead_for_organization(
    p_organization_id=>tenant_a,p_external_event_id=>'r2-643-a-phone-one',
    p_site=>'r2-contact-a.invalid',p_form_name=>'synthetic',
    p_phone=>'+910000006431');
  id_phone := (result->>'lead_id')::uuid;
  IF id_phone IS NULL OR id_phone=id_email THEN
    RAISE EXCEPTION 'R2 #643: independent phone-only lead not created';
  END IF;
  INSERT INTO public.lead_contacts (
    organization_id,lead_id,contact_type,value,normalized_value,is_primary
  ) VALUES (
    tenant_a,id_phone,'whatsapp','+910000006432','+910000006432',false
  );
  result := public.ingest_website_lead_for_organization(
    p_organization_id=>tenant_a,p_external_event_id=>'r2-643-a-phone-two',
    p_site=>'r2-contact-a.invalid',p_form_name=>'synthetic',
    p_phone=>'+910000006432');
  IF (result->>'lead_id')::uuid IS DISTINCT FROM id_phone
     OR result->>'matched_existing' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'R2 #643: inbound alternate phone/WhatsApp mismatch';
  END IF;
  SELECT count(*)::int,count(*) filter(where is_primary)::int INTO n,p
  FROM public.lead_contacts
  WHERE organization_id=tenant_a AND lead_id=id_phone AND contact_type='phone';
  IF n<>2 OR p<>1 OR NOT EXISTS (
      SELECT 1 FROM public.lead_contacts
      WHERE organization_id=tenant_a AND lead_id=id_phone
        AND contact_type='phone' AND normalized_value='+910000006431' AND is_primary
    ) THEN
    RAISE EXCEPTION 'R2 #643: second primary phone not prevented';
  END IF;

  -- Two already distinct known leads MUST NEVER be merged by a mixed
  -- submission carrying email from one and phone from the other.
  denied := false;
  BEGIN
    PERFORM public.ingest_website_lead_for_organization(
      p_organization_id=>tenant_a,p_external_event_id=>'r2-643-a-conflicted',
      p_site=>'r2-contact-a.invalid',p_form_name=>'synthetic',
      p_email=>'first643@example.invalid',p_phone=>'+910000006431');
  EXCEPTION WHEN OTHERS THEN
    denied := SQLERRM LIKE 'Email and phone belong to different existing leads%';
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'R2 #643: distinct leads were merged or failed unclearly';
  END IF;
  SELECT count(*)::int INTO n FROM public.lead_ingest_events
    WHERE organization_id=tenant_a AND external_event_id='r2-643-a-conflicted';
  IF n<>0 THEN
    RAISE EXCEPTION 'R2 #643: conflict persisted a lead receipt';
  END IF;

  -- Different tenant with exact SAME normalized email must be isolated.
  result := public.ingest_website_lead_for_organization(
    p_organization_id=>tenant_b,p_external_event_id=>'r2-643-b-initial',
    p_site=>'r2-contact-b.invalid',p_form_name=>'synthetic',
    p_email=>'first643@example.invalid');
  id_b := (result->>'lead_id')::uuid;
  IF id_b IS NULL OR id_b=id_email THEN
    RAISE EXCEPTION 'R2 #643: tenant B incorrectly reused tenant A lead';
  END IF;
  SELECT count(*)::int INTO n FROM public.lead_contacts
    WHERE normalized_value='first643@example.invalid'
      AND organization_id IN (tenant_a,tenant_b)
      AND contact_type='email';
  IF n<>2 THEN
    RAISE EXCEPTION 'R2 #643: independent tenant email was deduplicated across orgs';
  END IF;

  -- The credential-bound wrapper must reject tenant A's site for tenant B.
  denied:=false;
  BEGIN
    PERFORM public.ingest_website_lead_for_organization(
      p_organization_id=>tenant_b,p_external_event_id=>'r2-643-b-cross-site',
      p_site=>'r2-contact-a.invalid',p_form_name=>'synthetic',
      p_email=>'cross-tenant643@example.invalid');
  EXCEPTION WHEN OTHERS THEN
    denied := SQLERRM LIKE 'Website is not registered to the authenticated organization%';
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'R2 #643: tenant B accepted site A or rejected for unrelated reasons';
  END IF;
  SELECT count(*)::int INTO n FROM public.lead_ingest_events
    WHERE organization_id=tenant_b AND external_event_id='r2-643-b-cross-site';
  IF n<>0 THEN
    RAISE EXCEPTION 'R2 #643: blocked foreign site still persisted a receipt';
  END IF;

  -- No silent cross-person identifier owner reassignment.
  IF EXISTS (
    SELECT 1 FROM public.person_identifiers pi
    WHERE pi.organization_id=tenant_a
      AND pi.normalized_value='first643@example.invalid'
      AND EXISTS(
        SELECT 1 FROM public.person_identifiers other
        WHERE other.organization_id=tenant_b AND other.normalized_value=pi.normalized_value
          AND other.person_id=pi.person_id
      )
  ) THEN
    RAISE EXCEPTION 'R2 #643: same Person identity leaked across organizations';
  END IF;
END;
$r2_full_ingest$;

-- All rows and triggered identity graph writes are transactional and vanish.
ROLLBACK;
\echo 'R2 #643: FULL local ingest RPC + identity trigger checks PASSED; ROLLBACK complete'
