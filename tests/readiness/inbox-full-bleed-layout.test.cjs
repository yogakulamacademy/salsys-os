const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("only /conversations gets a full-viewport main shell, other routes keep their spacing", () => {
  const shell = read("components/app-shell.tsx");
  assert.match(shell, /pathname === "\/conversations"\s*\? "h-\[calc\(100dvh-4rem\)\] min-h-0 overflow-hidden p-0"/);
  assert.ok(shell.includes('"page-transition h-full min-h-0 w-full max-w-none"'));
  assert.ok(shell.includes('"min-h-[calc(100vh-4rem)] px-4 py-5 sm:px-5 lg:px-6 lg:py-6"'));
  assert.ok(shell.includes('"page-transition mx-auto w-full max-w-[1680px]"'));
});

test("Inbox stretches flush to edges without modifying its three-column contents", () => {
  const layout = read("app/conversations/layout.tsx");
  const page = read("app/conversations/page.tsx");
  assert.ok(layout.includes("inbox-viewport-inner"));
  assert.match(layout, /\.inbox-standalone-scope > \.inbox-viewport-inner\s*\{[\s\S]*?padding: 0 !important;/);
  assert.match(layout, /\.inbox-standalone-scope \.ibx-v2 \.conversation-workspace\s*\{[\s\S]*?flex: 1 1 auto;[\s\S]*?height: auto !important;[\s\S]*?border: 0 !important;[\s\S]*?border-radius: 0 !important;/);
  assert.ok(layout.includes(".inbox-standalone-scope .ibx-v2 .conversation-sidebar"));
  assert.ok(layout.includes("CrmLeadInspectorBridge"));
  assert.ok(layout.includes("ConversationCollaborationDock"));
  assert.ok(layout.includes('hasCurrentWorkspaceAccess("sales")'));
  assert.ok(page.includes("<ConversationWorkspaceShell"));
  assert.ok(page.includes("inbox={inbox}"));
  assert.ok(page.includes("chat={chat}"));
  assert.ok(page.includes("context={context}"));
});

test("Inbox starts immediately below app header without a live-status strip", () => {
  const page = read("app/conversations/page.tsx");
  const realtime = read("components/conversations-realtime.tsx");
  assert.ok(page.includes('className="ibx-v2 conversations-polish gap-2"'));
  assert.ok(!page.includes('className="ibx-v2 conversations-polish space-y-2"'));
  assert.ok(page.includes("<ConversationsRealtime />"));

  // Removing the status indicator must not disable message refresh or the
  // Instagram outbound composer bridge.
  assert.ok(realtime.includes(".channel('crm-conversations-live')"));
  assert.ok(realtime.includes("crm:conversation-inbound"));
  assert.ok(realtime.includes(".subscribe()"));
  assert.ok(realtime.includes("router.refresh()"));
  assert.ok(realtime.includes("return <InstagramOutboundBridge />;"));
  assert.ok(!realtime.includes("Live updates"));
  assert.ok(!realtime.includes("min-h-7"));
});
