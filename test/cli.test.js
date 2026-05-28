"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { fallbackHint, hasExplicitClients, parseArgs, selectedClients, validateAPIKey, validateConfigTarget } = require("../lib/cli");
const { removeClients, setupClients } = require("../lib/clients");

function withTempDirs(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tryoz-test-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "project");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  const oldHome = process.env.TRYOZ_TEST_HOME;
  const oldPath = process.env.PATH;
  const oldCwd = process.cwd();
  process.env.TRYOZ_TEST_HOME = home;
  process.env.PATH = "";
  process.chdir(cwd);
  try {
    return fn({ root, home, cwd });
  } finally {
    process.chdir(oldCwd);
    if (oldHome === undefined) delete process.env.TRYOZ_TEST_HOME;
    else process.env.TRYOZ_TEST_HOME = oldHome;
    process.env.PATH = oldPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("parseArgs supports new agent targets and scope", () => {
  const parsed = parseArgs(["setup", "--codex", "--copilot-agent", "--project", "--api-key", "oz-test"]);
  assert.equal(parsed.command, "setup");
  assert.equal(parsed.codex, true);
  assert.equal(parsed.copilot_agent, true);
  assert.equal(parsed.scope, "project");
  assert.equal(parsed.apiKey, "oz-test");
});

test("parseArgs supports common target aliases", () => {
  const parsed = parseArgs(["setup", "--codex-cli", "--claude-code", "--grok-build"]);
  assert.equal(parsed.codex, true);
  assert.equal(parsed.claude, true);
  assert.equal(parsed.grok, true);
});

test("package metadata includes public docs and bundled templates", () => {
  const pkg = require("../package.json");
  assert.equal(pkg.name, "tryoz");
  assert.ok(pkg.keywords.includes("mcp"));
  assert.ok(pkg.files.includes("templates"));
  assert.ok(pkg.files.includes("docs"));
  assert.ok(pkg.files.includes("assets"));
  assert.equal(fs.existsSync(path.join(__dirname, "..", "templates", "skills", "oz", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "templates", "rules", "oz-policy.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "docs", "clients", "codex.md")), true);
});

test("selectedClients maps dashed flags back to client IDs", () => {
  const clients = selectedClients({ copilot_agent: true }, {});
  assert.deepEqual(clients, ["copilot-agent"]);
});

test("hasExplicitClients recognizes dashed flags", () => {
  assert.equal(hasExplicitClients({ copilot_agent: true }), true);
  assert.equal(hasExplicitClients({}), false);
});

test("fallback hints match agent-specific UX copy", () => {
  assert.equal(fallbackHint("grok"), "Claude-compatible");
  assert.equal(fallbackHint("copilot-agent"), "project config");
  assert.equal(fallbackHint("cursor"), "not detected");
});

test("validateAPIKey requires oz prefix", () => {
  assert.doesNotThrow(() => validateAPIKey("oz-123"));
  assert.throws(() => validateAPIKey("bad"), /must start with oz-/);
});

test("codex global setup writes MCP and skill without mutating shell rc files", () => {
  withTempDirs(({ home, cwd }) => {
    const changes = setupClients(["codex"], {
      apiKey: "oz-test",
      cwd,
      dryRun: false,
      endpoint: "https://tryoz.dev/mcp",
      scope: "global"
    });

    const config = fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
    assert.match(config, /\[mcp_servers\.oz\]/);
    assert.match(config, /bearer_token_env_var = "OZ_API_KEY"/);

    const skill = fs.readFileSync(path.join(home, ".codex", "skills", "oz", "SKILL.md"), "utf8");
    assert.match(skill, /Use Oz first/);
    assert.match(skill, /Do not hallucinate/);

    assert.equal(fs.existsSync(path.join(home, ".zshrc")), false);
    assert.equal(fs.existsSync(path.join(home, ".bashrc")), false);
    assert.equal(changes.some((item) => item.client === "codex-env" && item.message.includes("export OZ_API_KEY='oz-test'")), true);
    assert.equal(fs.existsSync(path.join(cwd, "AGENTS.md")), false);
  });
});

test("cursor project setup writes only cursor project files and removes them", () => {
  withTempDirs(({ cwd }) => {
    const context = {
      apiKey: "oz-test",
      cwd,
      dryRun: false,
      endpoint: "https://tryoz.dev/mcp",
      scope: "project"
    };
    setupClients(["cursor"], context);

    const configPath = path.join(cwd, ".cursor", "mcp.json");
    const rulePath = path.join(cwd, ".cursor", "rules", "oz.mdc");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(config.mcpServers.oz.url, "https://tryoz.dev/mcp");
    assert.equal(config.mcpServers.oz.headers.Authorization, "Bearer oz-test");
    assert.match(fs.readFileSync(rulePath, "utf8"), /resolve-library-id/);

    removeClients(["cursor"], context);
    assert.equal(fs.existsSync(rulePath), false);
    const after = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(after.mcpServers.oz, undefined);
  });
});

test("claude project setup installs project skill and policy", () => {
  withTempDirs(({ cwd }) => {
    setupClients(["claude"], {
      apiKey: "oz-test",
      cwd,
      dryRun: false,
      endpoint: "https://tryoz.dev/mcp",
      scope: "project"
    });

    const mcp = JSON.parse(fs.readFileSync(path.join(cwd, ".mcp.json"), "utf8"));
    assert.equal(mcp.mcpServers.oz.url, "https://tryoz.dev/mcp");
    assert.match(fs.readFileSync(path.join(cwd, ".claude", "skills", "oz", "SKILL.md"), "utf8"), /Oz Documentation Workflow/);
    assert.match(fs.readFileSync(path.join(cwd, "CLAUDE.md"), "utf8"), /Oz Documentation Policy/);
  });
});

test("validateConfigTarget validates JSON and TOML files", () => {
  withTempDirs(({ cwd }) => {
    const jsonPath = path.join(cwd, "mcp.json");
    const tomlPath = path.join(cwd, "config.toml");
    fs.writeFileSync(jsonPath, '{"servers":{}}\n');
    fs.writeFileSync(tomlPath, '[mcp_servers.oz]\nurl = "https://tryoz.dev/mcp"\n');

    assert.equal(validateConfigTarget({ client: "test", label: "JSON", path: jsonPath, type: "json" }).status, "ok");
    assert.equal(validateConfigTarget({ client: "test", label: "TOML", path: tomlPath, type: "toml" }).status, "ok");

    fs.writeFileSync(jsonPath, '{bad');
    assert.equal(validateConfigTarget({ client: "test", label: "JSON", path: jsonPath, type: "json" }).status, "fail");
  });
});
