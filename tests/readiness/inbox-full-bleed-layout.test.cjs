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
