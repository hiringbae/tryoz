"use strict";

const SDK_VERSION = require("../package.json").version;

async function testMCP(endpoint, apiKey) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "accept": "application/json, text/event-stream",
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-oz-client": "tryoz-cli",
      "x-oz-sdk-version": SDK_VERSION
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MCP tools/list failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  const body = JSON.parse(text);
  const tools = body && body.result && Array.isArray(body.result.tools) ? body.result.tools : [];
  const names = tools.map((tool) => tool.name).sort();
  for (const required of ["get-library-docs", "resolve-library-id"]) {
    if (!names.includes(required)) {
      throw new Error(`MCP tools/list missing ${required}; got ${names.join(", ") || "no tools"}`);
    }
  }
  return names;
}

module.exports = { testMCP };
