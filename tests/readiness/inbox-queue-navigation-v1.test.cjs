const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { load } = require("./helpers.cjs");

const { nextInboxQueueHref, resetInboxQueueHref } = load("lib/inbox-query-navigation.ts");

function parts(href) {
  const url = new URL(href, "https://synthetic-crm.invalid");
  return { path: url.pathname, query: url.searchParams };
}

test("search changes clear a stale selected conversation and transient send notices", () => {
  const previous = "lead=old-lead&q=old&page=6&sort=activity_desc&scope=mine&channel=instagram&notice=sent&wamid=secret-id&error=legacy";
  const next = parts(nextInboxQueueHref(previous, "q", "new search"));
  assert.equal(next.path, "/conversations");
  assert.equal(next.query.get("q"), "new search");
  assert.equal(next.query.get("scope"), "mine");
  assert.equal(next.query.get("sort"), "activity_desc");
  assert.equal(next.query.get("channel"), "instagram");
  for (const key of ["lead", "page", "notice", "wamid", "error"]) {
    assert.equal(next.query.has(key), false, key);
  }
});

test("filter, scope, priority and channel changes discard old thread selection", () => {
  for (const [key, value] of [
    ["filter", "reply"], ["scope", "unassigned"],
    ["priority", "urgent"], ["channel", "whatsapp"],
  ]) {
    const next = parts(nextInboxQueueHref("lead=previous-lead&page=5&q=fee&sort=activity_desc", key, value));
    assert.equal(next.query.get(key), value);
    assert.equal(next.query.get("q"), "fee");
    assert.equal(next.query.get("sort"), "activity_desc");
    assert.equal(next.query.has("lead"), false);
    assert.equal(next.query.has("page"), false);
  }
});

test("pagination retains queue context and selected thread is cleared", () => {
  const next = parts(nextInboxQueueHref(
    "lead=old-lead&page=3&q=prenatal&sort=activity_desc&filter=reply&scope=team&channel=instagram",
    "page", "4", true,
  ));
  assert.equal(next.query.get("page"), "4");
  assert.equal(next.query.get("q"), "prenatal");
  assert.equal(next.query.get("sort"), "activity_desc");
  assert.equal(next.query.get("filter"), "reply");
  assert.equal(next.query.get("channel"), "instagram");
  assert.equal(next.query.has("lead"), false);
});

test("reset clears all queue and selected detail state", () => {
  const href = resetInboxQueueHref(
    "lead=old&page=4&q=lead&sort=activity_desc&scope=mine&filter=reply&priority=high&channel=website&notice=sent&error=oops&wamid=123",
  );
  assert.equal(href, "/conversations");
});

test("default values canonicalize without reintroducing stale selected lead", () => {
  const values = [
    ["sort", "created_desc"], ["filter", "all"], ["priority", "all"],
    ["channel", "all"], ["page", "1"],
  ];
  for (const [key, value] of values) {
    const next = parts(nextInboxQueueHref(`lead=stale&${key}=anything`, key, value, key === "page"));
    assert.equal(next.query.has(key), false, key);
    assert.equal(next.query.has("lead"), false);
  }
});

test("Inbox sidebar actually uses pure URL guards, not its previous stale query builder", () => {
  const sidebar = readFileSync("components/conversations-sidebar.tsx", "utf8");
  assert.match(sidebar, /nextInboxQueueHref\(searchParams\.toString\(\), key, value, preservePage\)/);
  assert.match(sidebar, /resetInboxQueueHref\(searchParams\.toString\(\)\)/);
  assert.match(sidebar, /params\.set\("lead", id\)/);
  assert.match(sidebar, /setInboxParam\("page", String\(pagination\.page \+ 1\), true\)/);
  assert.doesNotMatch(sidebar, /for \(const key of \["q","page","sort","scope","filter","priority","channel"\]\) params\.delete/);
});
