"use strict";

const fs = require("node:fs");
const path = require("node:path");
const pc = require("picocolors");
const toml = require("toml");
const { CLIENT_META, CLIENTS, DEFAULT_ENDPOINT } = require("./constants");
const { commandExists, readText } = require("./fsx");
const { configTargets, detectClients, removeClients, setupClients } = require("./clients");
const { testMCP } = require("./mcp");
const { sendTelemetry } = require("./telemetry");
const pkg = require("../package.json");

const FLAG_ALIASES = {
  "--codex-cli": "codex",
  "--codex-ide": "codex",
  "--claude-code": "claude",
  "--copilot-cli": "copilot",
  "--github-copilot": "copilot",
  "--github-copilot-agent": "copilot-agent",
  "--grok-build": "grok"
};

let promptModule = null;

async function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help || !parsed.command) {
    printHelp();
    return;
  }
  if (parsed.command === "version") {
    writePayload(parsed, pkg.version, { plain: true });
    return;
  }
  if (parsed.command === "detect" || parsed.command === "list-agents" || parsed.command === "agents") {
    const detected = detectClients();
    writePayload(parsed, { clients: detected });
    if (!parsed.jsonOutput) printDetected(detected);
    return;
  }
  if (parsed.command === "setup") {
    await runSetup(parsed);
    return;
  }
  if (parsed.command === "remove" || parsed.command === "logout") {
    await runRemove(parsed);
    return;
  }
  if (parsed.command === "doctor") {
    await runDoctor(parsed);
    return;
  }
  if (parsed.command === "mcp" && parsed.subcommand === "test") {
    await runMCPTest(parsed);
    return;
  }
  throw new Error(`Unknown command: ${[parsed.command, parsed.subcommand].filter(Boolean).join(" ")}`);
}

async function runSetup(options) {
  const detected = detectClients();
  const interactive = shouldPrompt(options);
  if (interactive) printBanner();
  const clients = interactive && !hasExplicitClients(options)
    ? await promptClients(detected)
    : selectedClients(options, detected, { defaultAll: true });
  if (clients.length === 0) {
    throw new Error("No supported coding agents selected. Pass a target flag such as --codex or --claude.");
  }
  const scope = await resolveScope(options, interactive);
  const apiKey = await resolveAPIKey(options, true);
  validateAPIKey(apiKey);
  const context = buildContext(options, apiKey, scope);

  if (interactive && !options.yes && !context.dryRun) {
    const preview = setupClients(clients, { ...context, dryRun: true });
    printChanges("Write plan", preview);
    const confirmed = await confirmPrompt("Apply these changes?", true);
    if (!confirmed) {
      console.log("Setup canceled.");
      return;
    }
  }

  let success = false;
  let changes = [];
  let tools = [];
  let mcpCheck = context.dryRun ? "skipped_dry_run" : "not_run";
  try {
    changes = setupClients(clients, context);
    if (!context.dryRun) {
      tools = await testMCP(context.endpoint, apiKey);
      mcpCheck = "ok";
    }
    success = true;
  } finally {
    await sendTelemetry("setup", clients, success, options);
  }

  const result = {
    status: success ? "ok" : "failed",
    command: "setup",
    clients,
    scope,
    endpoint: context.endpoint,
    dryRun: context.dryRun,
    changes,
    mcpCheck,
    tools
  };
  if (options.jsonOutput) {
    writePayload(options, result);
    return;
  }
  printChanges("Setup complete", changes);
  if (context.dryRun) console.log(pc.yellow("MCP tools/list skipped for dry run."));
  else console.log(pc.green(`MCP tools/list OK: ${tools.join(", ")}`));
  printRestartHint(clients);
}

async function runRemove(options) {
  const detected = detectClients();
  const interactive = shouldPrompt(options);
  if (interactive) printBanner();
  const clients = interactive && !hasExplicitClients(options)
    ? await promptClients(detected)
    : selectedClients(options, detected, { defaultAll: true });
  const scope = await resolveScope(options, interactive);
  const context = buildContext(options, "", scope);

  if (interactive && !options.yes && !context.dryRun) {
    const preview = removeClients(clients, { ...context, dryRun: true });
    printChanges("Remove plan", preview);
    const confirmed = await confirmPrompt("Remove these Oz entries?", false);
    if (!confirmed) {
      console.log("Remove canceled.");
      return;
    }
  }

  let success = false;
  let changes = [];
  try {
    changes = removeClients(clients, context);
    success = true;
  } finally {
    await sendTelemetry("remove", clients, success, options);
  }

  const result = { status: success ? "ok" : "failed", command: "remove", clients, scope, dryRun: context.dryRun, changes };
  if (options.jsonOutput) {
    writePayload(options, result);
    return;
  }
  printChanges("Remove complete", changes);
}

async function runMCPTest(options) {
  const apiKey = await resolveAPIKey(options, true);
  validateAPIKey(apiKey);
  const endpoint = normalizeEndpoint(options.endpoint || DEFAULT_ENDPOINT);
  let success = false;
  let tools = [];
  try {
    tools = await testMCP(endpoint, apiKey);
    success = true;
  } finally {
    await sendTelemetry("mcp test", [], success, options);
  }
  const result = { status: "ok", endpoint, tools };
  if (options.jsonOutput) {
    writePayload(options, result);
    return;
  }
  console.log(pc.green(`MCP tools/list OK: ${tools.join(", ")}`));
}

async function runDoctor(options) {
  const detected = detectClients();
  const clients = selectedClients(options, detected);
  const scope = options.scope || "global";
  const endpoint = normalizeEndpoint(options.endpoint || DEFAULT_ENDPOINT);
  const apiKey = options.apiKey || process.env.OZ_API_KEY || process.env.TRYOZ_API_KEY || "";
  const checks = [];

  if (!apiKey) {
    checks.push(check("api-key", "warn", "No Oz API key provided; pass --api-key or set OZ_API_KEY."));
  } else {
    try {
      validateAPIKey(apiKey);
      checks.push(check("api-key", "ok", "API key format is valid."));
      const tools = await testMCP(endpoint, apiKey);
      checks.push(check("mcp-tools-list", "ok", `MCP tools/list OK: ${tools.join(", ")}`));
    } catch (error) {
      checks.push(check("mcp-tools-list", "fail", error.message));
    }
  }

  for (const client of clients) {
    const available = clientCommandAvailable(client);
    if (available === null) continue;
    checks.push(check(`${client}-cli`, available ? "ok" : "warn", available ? `${client} CLI detected.` : `${client} CLI not detected.`));
  }

  const targets = configTargets(clients, scope, process.cwd());
  for (const target of targets) {
    checks.push(validateConfigTarget(target));
  }

  const hasFailure = checks.some((item) => item.status === "fail");
  const result = {
    status: hasFailure ? "issues" : "ok",
    command: "doctor",
    clients,
    scope,
    endpoint,
    checks
  };
  if (options.jsonOutput) {
    writePayload(options, result);
    return;
  }
  printDoctor(result);
}

function buildContext(options, apiKey, scope) {
  return {
    apiKey,
    cwd: process.cwd(),
    dryRun: Boolean(options.dryRun),
    endpoint: normalizeEndpoint(options.endpoint || DEFAULT_ENDPOINT),
    scope
  };
}

function selectedClients(options, detected, opts = {}) {
  const explicit = CLIENTS.filter((client) => options[optionKey(client)]);
  if (options.all) return CLIENTS;
  if (explicit.length > 0) return explicit;
  if (opts.defaultAll) return CLIENTS;
  return CLIENTS.filter((client) => detected[client]);
}

function shouldPrompt(options) {
  if (options.noPrompt || options.jsonOutput || !process.stdin.isTTY) return false;
  return !hasExplicitClients(options) || !options.scope || (!options.apiKey && !process.env.OZ_API_KEY && !process.env.TRYOZ_API_KEY);
}

function hasExplicitClients(options) {
  return CLIENTS.some((client) => options[optionKey(client)]) || Boolean(options.all);
}

async function resolveScope(options, interactive) {
  if (options.scope) return options.scope;
  if (!interactive) return "global";
  const { select } = await loadPrompts();
  return select({
    message: "Scope",
    choices: [
      { name: "Global (Recommended)", value: "global" },
      { name: "Project", value: "project" }
    ],
    default: "global"
  });
}

async function resolveAPIKey(options, required) {
  const apiKey = options.apiKey || process.env.OZ_API_KEY || process.env.TRYOZ_API_KEY || "";
  if (apiKey) return apiKey.trim();
  if (!required) return "";
  if (options.jsonOutput || options.noPrompt || !process.stdin.isTTY) {
    throw new Error("Missing Oz API key. Pass --api-key oz-... or set OZ_API_KEY.");
  }
  const { password } = await loadPrompts();
  const value = await password({ message: "Oz API key", mask: "*" });
  if (!value.trim()) throw new Error("Missing Oz API key.");
  return value.trim();
}

function validateAPIKey(apiKey) {
  if (!String(apiKey || "").startsWith("oz-")) {
    throw new Error("Oz API key must start with oz-.");
  }
}

async function promptClients(detected) {
  const { checkbox } = await loadPrompts();
  return checkbox({
    message: "Select coding agents to configure:",
    pageSize: CLIENTS.length,
    required: true,
    choices: CLIENTS.map((client) => ({
      value: client,
      short: CLIENT_META[client].label,
      checked: true,
      name: `${padRight(CLIENT_META[client].label, 40)} ${detected[client] ? pc.green("detected") : pc.dim(fallbackHint(client))}`
    })),
    theme: {
      style: {
        renderSelectedChoices: (selectedChoices) => formatSelectedClients(selectedChoices.map((choice) => choice.value))
      }
    }
  });
}

function formatSelectedClients(clients) {
  if (clients.length === CLIENTS.length) return `all ${CLIENTS.length} agents`;
  if (clients.length === 1) return CLIENT_META[clients[0]].label;
  if (clients.length <= 3) return clients.map((client) => CLIENT_META[client].label).join(", ");
  return `${clients.length} agents selected`;
}

function fallbackHint(client) {
  if (client === "grok") return "Claude-compatible";
  if (client === "copilot-agent") return "project config";
  return "not detected";
}

async function confirmPrompt(message, defaultValue) {
  const { confirm } = await loadPrompts();
  return confirm({ message, default: defaultValue });
}

async function loadPrompts() {
  if (!promptModule) promptModule = await import("@inquirer/prompts");
  return promptModule;
}

function validateConfigTarget(target) {
  if (!fs.existsSync(target.path)) {
    return check(`${target.client}-config`, "warn", `${target.label} not found: ${target.path}`);
  }
  try {
    const content = readText(target.path);
    if (target.type === "json") JSON.parse(content || "{}");
    else if (target.type === "toml") toml.parse(content || "");
    return check(`${target.client}-config`, "ok", `${target.label} parses as ${target.type}: ${target.path}`);
  } catch (error) {
    return check(`${target.client}-config`, "fail", `${target.label} does not parse as ${target.type}: ${error.message}`);
  }
}

function clientCommandAvailable(client) {
  if (client === "codex") return commandExists("codex");
  if (client === "claude") return commandExists("claude");
  if (client === "cursor") return commandExists("cursor");
  if (client === "vscode") return commandExists("code");
  if (client === "cline") return commandExists("cline");
  if (client === "windsurf") return commandExists("windsurf");
  if (client === "opencode") return commandExists("opencode");
  if (client === "copilot") return commandExists("copilot");
  if (client === "grok") return commandExists("grok") || commandExists("grok-code");
  if (client === "gemini") return commandExists("gemini");
  return null;
}

function check(name, status, message) {
  return { name, status, message };
}

function parseArgs(argv) {
  const out = { command: "", subcommand: "" };
  const rest = [...argv];
  out.command = rest.shift() || "";
  if (out.command === "--version" || out.command === "-v") out.command = "version";
  if (out.command === "--help" || out.command === "-h") out.help = true;
  if (out.command === "mcp" && rest[0] && !rest[0].startsWith("-")) {
    out.subcommand = rest.shift();
  }
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--yes" || arg === "-y") out.yes = true;
    else if (arg === "--json") out.jsonOutput = true;
    else if (arg === "--all") out.all = true;
    else if (arg === "--no-prompt") out.noPrompt = true;
    else if (arg === "--no-telemetry") out.noTelemetry = true;
    else if (arg === "--global") out.scope = "global";
    else if (arg === "--project") out.scope = "project";
    else if (CLIENTS.map((client) => `--${client}`).includes(arg)) out[optionKey(arg.slice(2))] = true;
    else if (FLAG_ALIASES[arg]) out[optionKey(FLAG_ALIASES[arg])] = true;
    else if (arg === "--api-key") out.apiKey = rest[++i] || "";
    else if (arg.startsWith("--api-key=")) out.apiKey = arg.slice("--api-key=".length);
    else if (arg === "--endpoint") out.endpoint = rest[++i] || "";
    else if (arg.startsWith("--endpoint=")) out.endpoint = arg.slice("--endpoint=".length);
    else throw new Error(`Unknown option: ${arg}`);
  }
  return out;
}

function optionKey(client) {
  return client.replace(/-/g, "_");
}

function normalizeEndpoint(value) {
  return String(value || DEFAULT_ENDPOINT).trim().replace(/\/+$/, "");
}

function writePayload(options, payload, opts = {}) {
  if (options.jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (opts.plain) console.log(payload);
}

function printDetected(detected) {
  for (const client of CLIENTS) {
    const meta = CLIENT_META[client];
    const status = detected[client] ? pc.green("detected") : pc.dim("not detected");
    console.log(`${client}: ${status} - ${meta.label}`);
  }
}

function printChanges(title, changes) {
  console.log(pc.bold(title));
  if (changes.length === 0) {
    console.log("- no changes");
    return;
  }
  for (const item of changes) {
    console.log(`- ${pc.cyan(item.client)}: ${item.message}`);
  }
}

function printDoctor(result) {
  console.log(pc.bold("Oz doctor"));
  for (const item of result.checks) {
    const marker = item.status === "ok" ? pc.green("ok") : item.status === "warn" ? pc.yellow("warn") : pc.red("fail");
    console.log(`- ${marker} ${item.name}: ${item.message}`);
  }
  if (result.status === "ok") console.log(pc.green("Doctor completed without blocking issues."));
  else console.log(pc.yellow("Doctor found issues to review."));
}

function printBanner() {
  console.log(pc.cyan(`
   ____
  / __ \\____
 / / / /_  /
/ /_/ / / /_
\\____/ /___/
`));
  console.log(pc.bold("Oz MCP setup"));
  console.log("");
}

function printRestartHint(clients) {
  const needsRestart = clients.some((client) => ["codex", "claude", "cursor", "vscode", "windsurf"].includes(client));
  if (needsRestart) console.log(pc.dim("Restart selected agents if they were already running so they reload MCP and skill/rule files."));
}

function printHelp() {
  console.log(`tryoz ${pkg.version}

Usage:
  oz setup
  oz logout
  npx tryoz setup
  npx tryoz logout
  npx tryoz setup --codex --claude --global --api-key oz-...
  npx tryoz setup --all --project --api-key oz-...
  npx tryoz remove
  npx tryoz doctor --api-key oz-...
  npx tryoz mcp test --api-key oz-...
  npx tryoz list-agents
  npx tryoz detect

Setup flow:
  Interactive setup detects agents, lets you select multiple agents, asks for
  Global (recommended) or Project scope, asks for an oz- API key, shows the
  write plan, installs MCP config, installs Oz skill/rules, and verifies tools/list.

Alias:
  logout  Same as remove; use to remove Oz MCP config and skills/rules

Options:
  --codex             Configure Codex CLI / Codex IDE
  --claude            Configure Claude Code
  --cursor            Configure Cursor
  --vscode            Configure VS Code / GitHub Copilot
  --cline             Configure Cline
  --windsurf          Configure Windsurf
  --opencode          Configure OpenCode
  --copilot           Configure GitHub Copilot CLI
  --copilot-agent     Configure GitHub Copilot coding agent project files
  --grok              Configure Grok Build
  --gemini            Configure Gemini CLI policy
  --all               Configure all supported clients
  --global            Use global scope
  --project           Use project scope
  --api-key           Oz API key
  --endpoint          Oz MCP endpoint, defaults to ${DEFAULT_ENDPOINT}
  --json              Emit JSON output
  --dry-run           Show intended changes without writing files
  --yes, -y           Skip confirmation prompts
  --no-prompt         Disable interactive prompts
  --no-telemetry      Disable anonymous CLI telemetry
`);
}

function padRight(value, width) {
  const text = String(value);
  if (text.length >= width) return text;
  return text + " ".repeat(width - text.length);
}

module.exports = {
  clientCommandAvailable,
  fallbackHint,
  formatSelectedClients,
  hasExplicitClients,
  main,
  optionKey,
  parseArgs,
  selectedClients,
  validateAPIKey,
  validateConfigTarget
};
