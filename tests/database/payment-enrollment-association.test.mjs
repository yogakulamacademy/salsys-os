import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildRefundReadinessSql } from "../../scripts/build-refund-readiness-sandbox.mjs";

const url = new URL(
  process.env.SALSYS_TEST_DATABASE_URL ||
    "postgres://postgres:local-fixture-only@127.0.0.1:55432/postgres",
);
if (
  process.env.SALSYS_ALLOW_LOCAL_DB_TESTS !== "1" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  url.pathname !== "/postgres"
)
  throw Error(
    "Explicit local-only disposable database test configuration is required",
  );
const admin = new pg.Client({
  connectionString: url.href,
  application_name: "salsys-association-test-admin",
});
const org = "10000000-0000-4000-8000-000000000001",
  otherOrg = "10000000-0000-4000-8000-000000000002";
const lead = "40000000-0000-4000-8000-000000000001",
  otherLead = "40000000-0000-4000-8000-000000000003";
const claims = {
  role: "authenticated",
  sub: "20000000-0000-4000-8000-000000000001",
  session_id: "30000000-0000-4000-8000-000000000001",
};
const source = buildRefundReadinessSql();
const schema = source.slice(0, source.indexOf("create temp table assertions"));
const seedStart = source.indexOf("insert into public.organizations(id) values");
const seeds = source.slice(
  seedStart,
  source.indexOf("\nset local role authenticated;", seedStart),
);
const patchFile = fs
  .readdirSync("supabase/migrations")
  .find((f) => f.endsWith("_enrollment_processor_payment_association_v1.sql"));
const patch = fs.readFileSync(`supabase/migrations/${patchFile}`, "utf8");

// A reduced adapter containing the exact reviewed update/anchor. It deliberately
// does not claim to replay the deployed provider, intake or identity processors.
const adapter = `create function public.process_enrollment_raw_event_v1(p_organization_id uuid,p_raw_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare v_lead_id uuid;v_enrollment_id uuid;v_enrollment_reference text;v_booking_reference text;
begin
  select lead_id,id,metadata->>'booking_reference','synthetic-reference'
  into v_lead_id,v_enrollment_id,v_booking_reference,v_enrollment_reference
  from public.enrollments where organization_id=p_organization_id
    and (metadata->>'raw_event_id'=p_raw_event_id::text or metadata->>'latest_raw_event_id'=p_raw_event_id::text);
  if v_enrollment_reference is null then raise exception 'enrollment_reference is required'; end if;
  if v_booking_reference is not null then
    update public.payments p set enrollment_id=v_enrollment_id,updated_at=now()
    where p.organization_id=p_organization_id and p.lead_id=v_lead_id and p.enrollment_id is null
      and p.metadata->>'booking_reference'=v_booking_reference;
  end if;
  return jsonb_build_object('ok',true);
end; $body$;
create function public.process_tracking_raw_event_v1(p_organization_id uuid,p_raw_event_id uuid)
returns jsonb language sql security definer set search_path='' as $$select public.process_enrollment_raw_event_v1($1,$2)$$;`;

before(async () => {
  await admin.connect();
  await admin.query(`do $$begin
    if not exists(select 1 from pg_roles where rolname='anon')then create role anon nologin;end if;
    if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated nologin;end if;
    if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role nologin bypassrls;end if;
  end;$$;`);
});
after(async () => {
  await admin.end();
});

async function fixture(run, { patched = true, adapterSql = adapter } = {}) {
  const name = `salsys_refund_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(name, /^salsys_refund_test_[a-f0-9]{32}$/);
  const connection = new URL(url);
  connection.pathname = "/" + name;
  const clients = [];
  await admin.query(`create database "${name}"`);
  const connect = async () => {
    const c = new pg.Client({ connectionString: connection.href });
    await c.connect();
    clients.push(c);
    return c;
  };
  try {
    const owner = await connect();
    await owner.query(
      fs.readFileSync(
        new URL("./local-auth-bootstrap.sql", import.meta.url),
        "utf8",
      ),
    );
    await owner.query(`${schema}\n${seeds}\ncommit;`);
    const a = await connect(),
      b = await connect();
    const enrollment = randomUUID(),
      raw = randomUUID();
    await owner.query(
      `insert into public.enrollments(id,organization_id,lead_id,metadata) values($1,$2,$3,$4)`,
      [
        enrollment,
        org,
        lead,
        {
          booking_reference: "SYN-B1",
          raw_event_id: raw,
          trusted_server_event: true,
        },
      ],
    );
    await owner.query(adapterSql);
    if (patched) await owner.query(patch);
    await a.query("begin");
    await a.query("set local role authenticated");
    await a.query(`select set_config('request.jwt.claims',$1,true)`, [
      JSON.stringify(claims),
    ]);
    const original = (
      await a.query(
        `select public.verify_payment_v1($1,100,'INR','deposit','bank_transfer','original-association') as result`,
        [lead],
      )
    ).rows[0].result.payment_id;
    await a.query("commit");
    await owner.query(
      `update public.payments set metadata=metadata||'{"booking_reference":"SYN-B1"}' where id=$1`,
      [original],
    );
    await run({ owner, a, b, original, enrollment, raw });
  } finally {
    for (const c of clients) await c.query("rollback").catch(() => {});
    await Promise.allSettled(clients.map((c) => c.end()));
    await admin.query(`drop database "${name}"`);
  }
}
const link = (f) =>
  f.owner
    .query(
      "select public.associate_booking_payments_enrollment_v1($1,$2,$3,$4,$5) as result",
      [org, lead, f.enrollment, "SYN-B1", f.raw],
    )
    .then((r) => r.rows[0].result);
async function refund(
  client,
  original,
  { amount = 10, key = randomUUID() } = {},
) {
  return (
    await client.query(
      `select public.record_refund_v1($1,$2,$3,'INR',$4,'bank_transfer',null,null,'Synthetic bank return verified') as result`,
      [lead, original, amount, key],
    )
  ).rows[0].result;
}
async function authenticated(client) {
  await client.query("begin");
  await client.query("set local role authenticated");
  await client.query(`select set_config('request.jwt.claims',$1,true)`, [
    JSON.stringify(claims),
  ]);
}
async function totals(owner) {
  return (
    await owner.query(`select sum(case when payment_kind='refund' then -amount else amount end)::text as cash,
  count(*) filter(where payment_kind='refund')::integer as refunds from public.payments`)
  ).rows[0];
}
async function noAuthority(owner) {
  assert.equal(
    (
      await owner.query(
        "select count(*)::integer as n from public.payment_enrollment_link_authorizations",
      )
    ).rows[0].n,
    0,
  );
}
async function waitBlocked(owner, blocked, blocker) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (
      (
        await owner.query(
          "select $1::integer=any(pg_blocking_pids($2::integer)) as blocked",
          [blocker.processID, blocked.processID],
        )
      ).rows[0].blocked
    )
      return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw Error(
    "The competing transaction did not wait on the first transaction",
  );
}

test("late association links original and all linked refunds without changing cash", () =>
  fixture(async (f) => {
    await authenticated(f.a);
    const r = await refund(f.a, f.original);
    await f.a.query("commit");
    const before = await totals(f.owner);
    assert.equal((await link(f)).linked_records, 2);
    const rows = (
      await f.owner.query(
        "select id,enrollment_id,amount::text,currency from public.payments order by id",
      )
    ).rows;
    assert.ok(rows.every((p) => p.enrollment_id === f.enrollment));
    assert.ok(rows.some((p) => p.id === r.payment_id));
    assert.deepEqual(await totals(f.owner), before);
    await noAuthority(f.owner);
  }));
test("patched adapter executes the canonical association instead of the legacy update", () =>
  fixture(async (f) => {
    await authenticated(f.a);
    await refund(f.a, f.original);
    await f.a.query("commit");
    await f.owner.query("set role service_role");
    await f.owner.query("select public.process_tracking_raw_event_v1($1,$2)", [
      org,
      f.raw,
    ]);
    await f.owner.query("reset role");
    assert.equal(
      (
        await f.owner.query(
          "select count(*)::integer as n from public.payments where enrollment_id=$1",
          [f.enrollment],
        )
      ).rows[0].n,
      2,
    );
    await noAuthority(f.owner);
  }));
test("replays do not duplicate allocation audit or financial records", () =>
  fixture(async (f) => {
    await authenticated(f.a);
    await refund(f.a, f.original);
    await f.a.query("commit");
    await link(f);
    assert.equal((await link(f)).replayed, true);
    assert.equal(
      (
        await f.owner.query(
          "select count(*)::integer as n from public.activities where activity_type='payment_enrollment_linked'",
        )
      ).rows[0].n,
      1,
    );
    assert.deepEqual(await totals(f.owner), { cash: "90.00", refunds: 1 });
    await noAuthority(f.owner);
  }));
test("refunds arriving after an association inherit the same enrollment", () =>
  fixture(async (f) => {
    await link(f);
    await authenticated(f.a);
    const r = await refund(f.a, f.original);
    await f.a.query("commit");
    assert.equal(
      (
        await f.owner.query(
          "select enrollment_id from public.payments where id=$1",
          [r.payment_id],
        )
      ).rows[0].enrollment_id,
      f.enrollment,
    );
  }));
test("wrong tenant, lead and event evidence are rejected without partial links", () =>
  fixture(async (f) => {
    for (const [orgId, leadId, rawId, reference] of [
      [otherOrg, lead, f.raw, "SYN-B1"],
      [org, otherLead, f.raw, "SYN-B1"],
      [org, lead, randomUUID(), "SYN-B1"],
      [org, lead, f.raw, "wrong-booking"],
    ]) {
      await assert.rejects(
        f.owner.query(
          "select public.associate_booking_payments_enrollment_v1($1,$2,$3,$4,$5)",
          [orgId, leadId, f.enrollment, reference, rawId],
        ),
        /scope mismatch|tenant or lead mismatch|event evidence/,
      );
    }
    assert.equal(
      (
        await f.owner.query(
          "select enrollment_id from public.payments where id=$1",
          [f.original],
        )
      ).rows[0].enrollment_id,
      null,
    );
    await noAuthority(f.owner);
  }));
test("missing or untrusted recorded event evidence cannot authorize a link", () =>
  fixture(async (f) => {
    for (const metadata of [
      { booking_reference: "SYN-B1", trusted_server_event: true },
      {
        booking_reference: "SYN-B1",
        raw_event_id: f.raw,
        trusted_server_event: false,
      },
    ]) {
      await f.owner.query(
        "update public.enrollments set metadata=$1 where id=$2",
        [metadata, f.enrollment],
      );
      await assert.rejects(link(f), /event evidence/);
    }
    await noAuthority(f.owner);
  }));
test("authenticated and service roles cannot call the internal helper or forge authority", () =>
  fixture(async (f) => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await f.owner.query(`set role ${role}`);
      await assert.rejects(link(f), /permission denied/);
      await assert.rejects(
        f.owner.query(
          "insert into public.payment_enrollment_link_authorizations values(txid_current(),pg_backend_pid(),$1,$2,$3,$4)",
          [f.original, org, lead, f.enrollment],
        ),
        /permission denied/,
      );
      await f.owner.query("reset role");
    }
    await noAuthority(f.owner);
  }));
test("processor entry points are service-only and internal authority has no public execute grants", () =>
  fixture(async (f) => {
    const rows = (
      await f.owner
        .query(`select r,has_function_privilege(r,'public.process_enrollment_raw_event_v1(uuid,uuid)','EXECUTE') as enrollment,
    has_function_privilege(r,'public.process_tracking_raw_event_v1(uuid,uuid)','EXECUTE') as dispatcher,
    has_function_privilege(r,'public.associate_booking_payments_enrollment_v1(uuid,uuid,uuid,text,uuid)','EXECUTE') as internal
    from unnest(array['anon','authenticated','service_role']) r`)
    ).rows;
    assert.deepEqual(
      rows.map((r) => [r.r, r.enrollment, r.dispatcher, r.internal]),
      [
        ["anon", false, false, false],
        ["authenticated", false, false, false],
        ["service_role", true, true, false],
      ],
    );
  }));
test("direct association and forged session flags cannot bypass refunded-ledger protection", () =>
  fixture(async (f) => {
    await authenticated(f.a);
    const r = await refund(f.a, f.original);
    await f.a.query("commit");
    await f.owner.query(
      "select set_config('salsys.enrollment_link_authorized','true',false)",
    );
    await assert.rejects(
      f.owner.query("update public.payments set enrollment_id=$1 where id=$2", [
        f.enrollment,
        f.original,
      ]),
      /immutable/,
    );
    await assert.rejects(
      f.owner.query("update public.payments set enrollment_id=$1 where id=$2", [
        f.enrollment,
        r.payment_id,
      ]),
      /immutable/,
    );
    await assert.rejects(
      f.owner.query(
        `update public.payments set metadata=metadata||'{"booking_reference":"OTHER"}' where id=$1`,
        [f.original],
      ),
      /immutable/,
    );
  }));
test("a later conflicting enrollment cannot move a linked payment family", () =>
  fixture(async (f) => {
    await link(f);
    const alternate = randomUUID();
    await f.owner.query(
      "insert into public.enrollments(id,organization_id,lead_id,metadata) values($1,$2,$3,$4)",
      [
        alternate,
        org,
        lead,
        {
          booking_reference: "SYN-B1",
          raw_event_id: f.raw,
          trusted_server_event: true,
        },
      ],
    );
    await assert.rejects(
      f.owner.query(
        "select public.associate_booking_payments_enrollment_v1($1,$2,$3,$4,$5)",
        [org, lead, alternate, "SYN-B1", f.raw],
      ),
      /another enrollment/,
    );
    await noAuthority(f.owner);
  }));
test("linked enrollment ownership and booking identity cannot be rewritten", () =>
  fixture(async (f) => {
    await link(f);
    await assert.rejects(
      f.owner.query(
        "update public.enrollments set currency='USD' where id=$1",
        [f.enrollment],
      ),
      /cannot change/,
    );
    await assert.rejects(
      f.owner.query("update public.enrollments set lead_id=$1 where id=$2", [
        otherLead,
        f.enrollment,
      ]),
      /cannot change/,
    );
    await assert.rejects(
      f.owner.query(
        "update public.enrollments set organization_id=$1 where id=$2",
        [otherOrg, f.enrollment],
      ),
      /cannot change/,
    );
    await assert.rejects(
      f.owner.query(
        `update public.enrollments set metadata=metadata||'{"booking_reference":"OTHER"}' where id=$1`,
        [f.enrollment],
      ),
      /cannot change/,
    );
    await assert.rejects(
      f.owner.query("update public.enrollments set id=$1 where id=$2", [
        randomUUID(),
        f.enrollment,
      ]),
      /cannot change/,
    );
    await assert.rejects(
      f.owner.query("delete from public.enrollments where id=$1", [
        f.enrollment,
      ]),
      /cannot be deleted/,
    );
  }));

test("unlinked settled refunds require reconciliation before any allocation", () =>
  fixture(async (f) => {
    await f.owner.query(
      `insert into public.payments(organization_id,lead_id,payment_kind,status,amount,currency)
    values($1,$2,'refund','refunded',1,'INR')`,
      [org, lead],
    );
    await assert.rejects(link(f), /Reconcile existing unlinked refunds/);
    assert.equal(
      (
        await f.owner.query(
          "select enrollment_id from public.payments where id=$1",
          [f.original],
        )
      ).rows[0].enrollment_id,
      null,
    );
    await noAuthority(f.owner);
  }));
test("cross-currency targets and mixed-currency booking families cannot imply conversion", () =>
  fixture(async (f) => {
    await f.owner.query(
      "update public.enrollments set currency='USD' where id=$1",
      [f.enrollment],
    );
    await assert.rejects(link(f), /currencies must match/);
    await f.owner.query(
      "update public.enrollments set currency='INR' where id=$1",
      [f.enrollment],
    );
    await authenticated(f.a);
    const payment = (
      await f.a.query(
        "select public.verify_payment_v1($1,25,'USD','deposit','bank_transfer','usd-association') as result",
        [lead],
      )
    ).rows[0].result.payment_id;
    await f.a.query("commit");
    await f.owner.query(
      `update public.payments set metadata=metadata||'{"booking_reference":"SYN-B1"}' where id=$1`,
      [payment],
    );
    await assert.rejects(link(f), /currencies must match/);
    assert.equal(
      (
        await f.owner.query(
          "select count(*)::integer as n from public.payments where enrollment_id is not null",
        )
      ).rows[0].n,
      0,
    );
    await noAuthority(f.owner);
  }));
test("association audit failure rolls the whole family and temporary authority back", () =>
  fixture(async (f) => {
    await authenticated(f.a);
    await refund(f.a, f.original);
    await f.a.query("commit");
    await f.owner
      .query(`create function public.fixture_fail_association() returns trigger language plpgsql as $$begin if new.activity_type='payment_enrollment_linked' then raise exception 'synthetic association audit failure';end if;return new;end;$$;
    create trigger fixture_fail_association before insert on public.activities for each row execute function public.fixture_fail_association();`);
    await assert.rejects(link(f), /synthetic association audit failure/);
    assert.equal(
      (
        await f.owner.query(
          "select count(*)::integer as n from public.payments where enrollment_id is not null",
        )
      ).rows[0].n,
      0,
    );
    await noAuthority(f.owner);
  }));
test("refund-first concurrent association waits, then links both records", () =>
  fixture(async (f) => {
    await authenticated(f.a);
    await refund(f.a, f.original);
    await f.b.query("begin");
    const pending = f.b
      .query(
        "select public.associate_booking_payments_enrollment_v1($1,$2,$3,$4,$5)",
        [org, lead, f.enrollment, "SYN-B1", f.raw],
      )
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    await waitBlocked(f.owner, f.b, f.a);
    await f.a.query("commit");
    const result = await pending;
    assert.equal(result.error, undefined);
    await f.b.query("commit");
    assert.equal(
      (
        await f.owner.query(
          "select count(*)::integer as n from public.payments where enrollment_id=$1",
          [f.enrollment],
        )
      ).rows[0].n,
      2,
    );
    await noAuthority(f.owner);
  }));
test("association-first concurrent refund waits and inherits its committed allocation", () =>
  fixture(async (f) => {
    await f.b.query("begin");
    await f.b.query(
      "select public.associate_booking_payments_enrollment_v1($1,$2,$3,$4,$5)",
      [org, lead, f.enrollment, "SYN-B1", f.raw],
    );
    await authenticated(f.a);
    const pending = refund(f.a, f.original).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await waitBlocked(f.owner, f.a, f.b);
    await f.b.query("commit");
    const result = await pending;
    assert.equal(result.error, undefined);
    await f.a.query("commit");
    assert.equal(
      (
        await f.owner.query(
          "select enrollment_id from public.payments where id=$1",
          [result.value.payment_id],
        )
      ).rows[0].enrollment_id,
      f.enrollment,
    );
    await noAuthority(f.owner);
  }));
test("unknown processor shape aborts migration rather than silently skipping its update", () =>
  fixture(
    async (f) => {
      await f.owner.query(
        `create or replace function public.process_enrollment_raw_event_v1(p_organization_id uuid,p_raw_event_id uuid) returns jsonb language sql as $$select '{}'::jsonb$$`,
      );
      await assert.rejects(f.owner.query(patch), /exactly one reviewed/);
    },
    { patched: false },
  ));

test("processor ownership mismatch requires review rather than granting broader access", () =>
  fixture(
    async (f) => {
      await f.owner.query(
        "alter function public.process_enrollment_raw_event_v1(uuid,uuid) owner to authenticated",
      );
      await assert.rejects(f.owner.query(patch), /ownership must match/);
    },
    { patched: false },
  ));
test("missing processor baseline fails explicitly", () =>
  fixture(
    async (f) => {
      await f.owner.query(
        "drop function public.process_tracking_raw_event_v1(uuid,uuid)",
      );
      await assert.rejects(f.owner.query(patch), /baseline is required/);
    },
    { patched: false },
  ));
test("association preserves refund replay keys and all immutable financial fields", () =>
  fixture(async (f) => {
    const key = randomUUID();
    await authenticated(f.a);
    const r = await refund(f.a, f.original, { key });
    await f.a.query("commit");
    const sql =
      "select id,organization_id,lead_id,amount::text,currency,payment_kind,status,provider,external_payment_id,paid_at,original_payment_id,refund_request_id,metadata from public.payments order by id";
    const before = (await f.owner.query(sql)).rows;
    await link(f);
    assert.deepEqual((await f.owner.query(sql)).rows, before);
    await authenticated(f.a);
    assert.equal(
      (await refund(f.a, f.original, { key })).payment_id,
      r.payment_id,
    );
    await f.a.query("commit");
    await assert.rejects(
      f.owner.query("update public.payments set amount=1 where id=$1", [
        f.original,
      ]),
      /immutable/,
    );
    await assert.rejects(
      f.owner.query("update public.payments set currency='USD' where id=$1", [
        r.payment_id,
      ]),
      /immutable/,
    );
  }));
test("preexisting malformed refund allocation is rejected without moving its original", () =>
  fixture(async (f) => {
    await f.owner.query(
      `insert into public.payments(organization_id,lead_id,payment_kind,status,amount,currency,original_payment_id,refund_request_id)
    values($1,$2,'refund','refunded',1,'USD',$3,$4)`,
      [org, lead, f.original, randomUUID()],
    );
    await assert.rejects(link(f), /refund association conflicts/);
    assert.equal(
      (
        await f.owner.query(
          "select enrollment_id from public.payments where id=$1",
          [f.original],
        )
      ).rows[0].enrollment_id,
      null,
    );
    await noAuthority(f.owner);
  }));
test("repeatable-read association retries instead of linking a stale refund snapshot", () =>
  fixture(async (f) => {
    await authenticated(f.a);
    await f.b.query("begin isolation level repeatable read");
    await f.b.query("select count(*) from public.payments");
    await refund(f.a, f.original);
    const pending = f.b
      .query(
        "select public.associate_booking_payments_enrollment_v1($1,$2,$3,$4,$5)",
        [org, lead, f.enrollment, "SYN-B1", f.raw],
      )
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    await waitBlocked(f.owner, f.b, f.a);
    await f.a.query("commit");
    const result = await pending;
    assert.equal(result.error?.code, "40001");
    await f.b.query("rollback");
    assert.equal((await link(f)).linked_records, 2);
    await noAuthority(f.owner);
  }));
test("repeatable-read refund retries after an association changes its original row", () =>
  fixture(async (f) => {
    await f.b.query("begin");
    await f.a.query("begin isolation level repeatable read");
    await f.a.query("set local role authenticated");
    await f.a.query(`select set_config('request.jwt.claims',$1,true)`, [
      JSON.stringify(claims),
    ]);
    await f.a.query("select count(*) from public.payments");
    await f.b.query(
      "select public.associate_booking_payments_enrollment_v1($1,$2,$3,$4,$5)",
      [org, lead, f.enrollment, "SYN-B1", f.raw],
    );
    const pending = refund(f.a, f.original).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await waitBlocked(f.owner, f.a, f.b);
    await f.b.query("commit");
    const result = await pending;
    assert.equal(result.error?.code, "40001");
    await f.a.query("rollback");
    await authenticated(f.a);
    const r = await refund(f.a, f.original);
    await f.a.query("commit");
    assert.equal(
      (
        await f.owner.query(
          "select enrollment_id from public.payments where id=$1",
          [r.payment_id],
        )
      ).rows[0].enrollment_id,
      f.enrollment,
    );
  }));
test("oversized booking families fail atomically instead of holding unbounded association work", () =>
  fixture(async (f) => {
    await f.owner.query(
      `insert into public.payments(organization_id,lead_id,payment_kind,status,amount,currency,metadata)
    select $1,$2,'deposit','paid',1,'INR','{"booking_reference":"SYN-B1"}'::jsonb from generate_series(1,1000)`,
      [org, lead],
    );
    await assert.rejects(link(f), /bounded payment family limit/);
    assert.equal(
      (
        await f.owner.query(
          "select count(*)::integer as n from public.payments where enrollment_id is not null",
        )
      ).rows[0].n,
      0,
    );
    await noAuthority(f.owner);
  }));
test("private association authority has RLS, no API-role access and fixed definer search paths", () =>
  fixture(async (f) => {
    const table = (
      await f.owner.query(
        `select relrowsecurity from pg_class where oid='public.payment_enrollment_link_authorizations'::regclass`,
      )
    ).rows[0];
    assert.equal(table.relrowsecurity, true);
    const roles = (
      await f.owner
        .query(`select r,has_table_privilege(r,'public.payment_enrollment_link_authorizations','SELECT,INSERT,UPDATE,DELETE') as access
    from unnest(array['anon','authenticated','service_role']) r`)
    ).rows;
    assert.ok(roles.every((r) => r.access === false));
    const functions = (
      await f.owner
        .query(`select prosecdef,proconfig from pg_proc where oid in (
    'public.associate_booking_payments_enrollment_v1(uuid,uuid,uuid,text,uuid)'::regprocedure,
    'public.protect_linked_refund_ledger_v1()'::regprocedure,
    'public.protect_payment_enrollment_identity_v1()'::regprocedure)`)
    ).rows;
    assert.equal(functions.length, 3);
    assert.ok(
      functions.every(
        (p) =>
          p.prosecdef &&
          p.proconfig.some((c) => /^search_path=(?:""|)$/.test(c)),
      ),
    );
  }));
