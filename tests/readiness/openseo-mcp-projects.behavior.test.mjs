import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOpenSeoProjectInventory } from "../../lib/integrations/openseo-mcp-response.ts";

const sample = {
  id: "openseo-p1",
  name: "Yogakulam Academy",
  domain: "yogakulam.com",
  locationCode: 2356,
  languageCode: "en",
};

function mcp(projects, options = {}) {
  return {
    jsonrpc: "2.0",
    id: 1,
    result: { structuredContent: { projects }, ...options },
  };
}

test("accepts valid real structured MCP project inventory", () => {
  assert.deepEqual(
    parseOpenSeoProjectInventory(JSON.stringify(mcp([sample]))),
    [sample],
  );
});

test("accepts zero projects as real empty state", () => {
  assert.deepEqual(parseOpenSeoProjectInventory(JSON.stringify(mcp([]))), []);
});

test("parses stateless MCP SSE response", () => {
  const sse = `event: message\ndata: ${JSON.stringify(mcp([sample]))}\n\n`;
  assert.deepEqual(parseOpenSeoProjectInventory(sse), [sample]);
});

test("rejects MCP errors and tool isError", () => {
  assert.equal(
    parseOpenSeoProjectInventory(
      JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32001, message: "forbidden" } }),
    ),
    null,
  );
  assert.equal(
    parseOpenSeoProjectInventory(JSON.stringify(mcp([sample], { isError: true }))),
    null,
  );
});

test("rejects arbitrary text, wrong response IDs and fake unstructured projects", () => {
  assert.equal(parseOpenSeoProjectInventory("<html>OK</html>"), null);
  assert.equal(
    parseOpenSeoProjectInventory(JSON.stringify({ ...mcp([sample]), id: 2 })),
    null,
  );
  assert.equal(
    parseOpenSeoProjectInventory(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ text: "Projects (1)" }] } })),
    null,
  );
});

test("rejects malformed project data and oversized bodies", () => {
  assert.equal(
    parseOpenSeoProjectInventory(JSON.stringify(mcp([{ ...sample, locationCode: "not a number" }]))),
    null,
  );
  assert.equal(
    parseOpenSeoProjectInventory(JSON.stringify(mcp([{ ...sample, id: "" }]))),
    null,
  );
  assert.equal(parseOpenSeoProjectInventory("x".repeat(262145)), null);
  assert.equal(parseOpenSeoProjectInventory(JSON.stringify(mcp(Array.from({ length: 501 }, () => sample)))), null);
});

test("does not accept a response without structuredContent as successful", () => {
  assert.equal(
    parseOpenSeoProjectInventory(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: "All good" }] },
    })),
    null,
  );
});
