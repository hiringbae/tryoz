"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { fallbackHint, formatSelectedClients, hasExplicitClients, parseArgs, selectedClients, validateAPIKey, validateConfigTarget } = require("../lib/cli");
const { detectClientDetails, detectClients, removeClients, setupClients } = require("../lib/clients");
const { testMCP } = require("../lib/mcp");
const pkg = require("../package.json");

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

test("logout command alias runs in dry-run JSON mode", () => {
  withTempDirs(({ home, cwd }) => {
    const bin = path.join(__dirname, "..", "bin", "tryoz.js");
    const env = { ...process.env, TRYOZ_TEST_HOME: home, PATH: "" };
    const logout = JSON.parse(childProcess.execFileSync(process.execPath, [
      bin,
      "logout",
      "--codex",
      "--global",
      "--dry-run",
      "--json",
      "--no-telemetry"
    ], { cwd, env, encoding: "utf8" }));
    assert.equal(logout.status, "ok");
    assert.equal(logout.command, "remove");
    assert.deepEqual(logout.clients, ["codex"]);
  });
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

test("setup defaults to auto-selected detected clients when no target flag is provided", () => {
  const clients = selectedClients({}, {
    codex: { selected: true },
    claude: { selected: false },
    cursor: { selected: true }
  });
  assert.deepEqual(clients, ["codex", "cursor"]);
});

test("explicit setup target overrides auto detection", () => {
  const clients = selectedClients({ claude: true }, { codex: { selected: true } });
  assert.deepEqual(clients, ["claude"]);
});

test("client detection distinguishes cli/project signals from config-only signals", () => {
  withTempDirs(({ home, cwd }) => {
    fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
    fs.mkdirSync(path.join(cwd, ".github"), { recursive: true });

    const details = detectClientDetails(cwd);
    assert.equal(details.codex.available, true);
    assert.equal(details.codex.selected, false);
    assert.equal(details.codex.source, "config");
    assert.equal(details.codex.label, "config found");
    assert.equal(details["copilot-agent"].available, true);
    assert.equal(details["copilot-agent"].selected, true);
    assert.equal(details["copilot-agent"].source, "project");
    assert.equal(details["copilot-agent"].label, "project config");
    assert.equal(details.claude.available, false);
    assert.equal(details.claude.selected, false);

    const detected = detectClients();
    assert.equal(detected.codex, false);
    assert.equal(detected["copilot-agent"], true);
  });
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

test("selected client summary stays compact for interactive prompts", () => {
  assert.equal(formatSelectedClients(["codex"]), "Codex CLI / Codex IDE");
  assert.equal(formatSelectedClients(["codex", "claude", "cursor", "vscode"]), "4 agents selected");
  assert.equal(formatSelectedClients([
    "codex",
    "claude",
    "cursor",
    "vscode",
    "cline",
    "windsurf",
    "opencode",
    "copilot",
    "copilot-agent",
    "grok",
    "gemini"
  ]), "all 11 agents");
});

test("validateAPIKey requires oz prefix", () => {
  assert.doesNotThrow(() => validateAPIKey("oz-123"));
  assert.throws(() => validateAPIKey("bad"), /must start with oz-/);
});

test("codex global setup writes MCP, auth header, and skill without mutating shell rc files", () => {
  withTempDirs(({ home, cwd }) => {
    const changes = setupClients(["codex"], {
      apiKey: "oz-test",
      cwd,
      dryRun: false,
      endpoint: "https://tryoz.dev/mcp",
      scope: "global"
    });

    const configPath = path.join(home, ".codex", "config.toml");
    const config = fs.readFileSync(configPath, "utf8");
    assert.match(config, /\[mcp_servers\.oz\]/);
    assert.match(config, /Authorization = "Bearer oz-test"/);
    assert.match(config, /"X-Oz-Client" = "codex"/);
    assert.match(config, new RegExp(`"X-Oz-SDK-Version" = "${pkg.version.replaceAll(".", "\\.")}"`));
    assert.equal(validateConfigTarget({ client: "codex", label: "Codex config", path: configPath, type: "toml" }).status, "ok");

    const skill = fs.readFileSync(path.join(home, ".codex", "skills", "oz", "SKILL.md"), "utf8");
    assert.match(skill, /Use Oz first/);
    assert.match(skill, /Do not hallucinate/);

    assert.equal(fs.existsSync(path.join(home, ".zshrc")), false);
    assert.equal(fs.existsSync(path.join(home, ".bashrc")), false);
    assert.equal(changes.some((item) => item.client === "codex-env"), false);
    assert.equal(fs.existsSync(path.join(cwd, "AGENTS.md")), false);
  });
});

test("codex setup upgrades existing inline header config", () => {
  withTempDirs(({ home, cwd }) => {
    const configPath = path.join(home, ".codex", "config.toml");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, [
      "[mcp_servers.other]",
      'url = "https://example.com/mcp"',
      "",
      "[mcp_servers.oz]",
      'url = "https://tryoz.dev/mcp"',
      'http_headers = { Authorization = "Bearer oz-old" }',
      "enabled = true",
      ""
    ].join("\n"));

    setupClients(["codex"], {
      apiKey: "oz-new",
      cwd,
      dryRun: false,
      endpoint: "https://tryoz.dev/mcp",
      scope: "global"
    });

    const config = fs.readFileSync(configPath, "utf8");
    assert.match(config, /\[mcp_servers\.other\]/);
    assert.doesNotMatch(config, /oz-old/);
    assert.doesNotMatch(config, /http_headers = \{/);
    assert.match(config, /\[mcp_servers\.oz\.http_headers\]/);
    assert.match(config, /Authorization = "Bearer oz-new"/);
    assert.match(config, /"X-Oz-Client" = "codex"/);
    assert.equal(validateConfigTarget({ client: "codex", label: "Codex config", path: configPath, type: "toml" }).status, "ok");
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
    assert.equal(config.mcpServers.oz.headers["X-Oz-Client"], "cursor");
    assert.equal(config.mcpServers.oz.headers["X-Oz-SDK-Version"], pkg.version);
    assert.match(fs.readFileSync(rulePath, "utf8"), /resolve-library-id/);

    removeClients(["cursor"], context);
    assert.equal(fs.existsSync(rulePath), false);
    const after = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(after.mcpServers.oz, undefined);
  });
});

test("cursor setup upgrades existing auth-only config", () => {
  withTempDirs(({ cwd }) => {
    const configPath = path.join(cwd, ".cursor", "mcp.json");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        oz: {
          type: "streamableHttp",
          url: "https://tryoz.dev/mcp",
          headers: {
            Authorization: "Bearer oz-old"
          }
        }
      }
    }, null, 2));

    setupClients(["cursor"], {
      apiKey: "oz-new",
      cwd,
      dryRun: false,
      endpoint: "https://tryoz.dev/mcp",
      scope: "project"
    });

    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(config.mcpServers.oz.headers.Authorization, "Bearer oz-new");
    assert.equal(config.mcpServers.oz.headers["X-Oz-Client"], "cursor");
    assert.equal(config.mcpServers.oz.headers["X-Oz-SDK-Version"], pkg.version);
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
    assert.equal(mcp.mcpServers.oz.headers["X-Oz-Client"], "claude");
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

test("MCP probe sends Oz client attribution headers", async () => {
  const originalFetch = global.fetch;
  let seenHeaders = {};
  global.fetch = async (_url, options) => {
    seenHeaders = options.headers || {};
    return {
      ok: true,
      text: async () => JSON.stringify({
        result: {
          tools: [
            { name: "get-library-docs" },
            { name: "resolve-library-id" }
          ]
        }
      })
    };
  };
  try {
    await testMCP("https://tryoz.dev/mcp", "oz-test");
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(seenHeaders["x-oz-client"], "tryoz-cli");
  assert.equal(seenHeaders["x-oz-sdk-version"], pkg.version);
});
