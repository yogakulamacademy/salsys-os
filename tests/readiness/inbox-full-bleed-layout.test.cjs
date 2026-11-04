const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("only /conversations gets a full-viewport main shell, other routes keep their spacing", () => {
  const shell = read("components/app-shell.tsx");
  // The shell uses its actual header height instead of subtracting a guessed
  // 4rem from the viewport; otherwise the Inbox footer gets clipped.
  assert.match(shell, /pathname === "\/conversations"\s*\? "flex h-\[100dvh\] min-h-0 flex-col overflow-hidden"/);
  assert.match(shell, /pathname === "\/conversations"\s*\? "min-h-0 flex-1 overflow-hidden p-0"/);
  assert.ok(shell.includes('className="sticky top-0 z-30 flex h-16 shrink-0 items-center'));
  assert.ok(!shell.includes('h-[calc(100dvh-4rem)] min-h-0 overflow-hidden p-0'));
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

test("Inbox footer and composer remain inside the viewport with independently scrolling panels", () => {
  const shell = read("components/app-shell.tsx");
  const workspace = read("components/conversation-workspace-shell.tsx");
  const sidebar = read("components/conversations-sidebar.tsx");
  const page = read("app/conversations/page.tsx");
  assert.ok(shell.includes('"flex h-[100dvh] min-h-0 flex-col overflow-hidden"'));
  assert.ok(shell.includes('"min-h-0 flex-1 overflow-hidden p-0"'));
  assert.ok(workspace.includes('className={`conversation-workspace relative overflow-hidden'));
  assert.ok(workspace.includes('min-h-0 overflow-y-auto border-l'));
  assert.ok(workspace.includes('relative min-h-0 flex-1 overflow-hidden'));
  assert.ok(sidebar.includes('flex h-full min-h-0 flex-col overflow-hidden'));
  assert.ok(sidebar.includes('min-h-0 flex-1 overflow-y-auto'));
  assert.ok(sidebar.includes('shrink-0 border-t border-line'));
  assert.ok(page.includes('ibx-v2-chat flex h-full min-h-0 min-w-0 flex-col overflow-hidden'));
  const layout = read("app/conversations/layout.tsx");
  assert.ok(layout.includes("overflow-y: auto;"));
  assert.ok(layout.includes("max-height: min(24dvh, 160px)"));
  assert.ok(layout.includes("flex: 0 1 auto;"));
  assert.ok(page.includes("<ConversationWorkspaceShell"));
});
