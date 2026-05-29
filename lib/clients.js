"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  AGENTS_POLICY,
  CURSOR_RULE,
  SKILL_TEXT
} = require("./constants");
const {
  commandExists,
  exists,
  homePath,
  readJSON,
  readText,
  removeMarkedBlock,
  upsertMarkedBlock,
  writeJSON,
  writeText
} = require("./fsx");

const BLOCK = "OZ DOCUMENTATION POLICY";
const MCP_NAME = "oz";

function detectClients() {
  return {
    codex: commandExists("codex") || exists(homePath(".codex")),
    claude: commandExists("claude") || exists(homePath(".claude")),
    cursor: exists(homePath(".cursor")) || commandExists("cursor"),
    vscode: commandExists("code") || exists(vscodeUserDir()),
    cline: commandExists("cline") || exists(homePath(".cline")) || exists(clineExtensionConfigPath()),
    windsurf: exists(homePath(".codeium", "windsurf")) || commandExists("windsurf"),
    opencode: commandExists("opencode") || exists(opencodeConfigPath("global")),
    copilot: commandExists("copilot") || exists(githubCopilotConfigPath("global")),
    "copilot-agent": exists(path.join(process.cwd(), ".github")),
    grok: commandExists("grok") || commandExists("grok-code") || exists(homePath(".grok")),
    gemini: commandExists("gemini") || exists(homePath(".gemini")) || exists(path.join(process.cwd(), "GEMINI.md"))
  };
}

function setupClients(clients, context) {
  const changes = [];
  for (const client of clients) {
    dispatch(client, "setup", context, changes);
  }
  return changes;
}

function removeClients(clients, context) {
  const changes = [];
  for (const client of clients) {
    dispatch(client, "remove", context, changes);
  }
  return changes;
}

function configTargets(clients, scope, cwd = process.cwd()) {
  const targets = [];
  for (const client of clients) {
    if (client === "codex") targets.push({ client, label: "Codex config", path: homePath(".codex", "config.toml"), type: "toml" });
    if (client === "claude" && scope === "project") targets.push({ client, label: "Claude project MCP", path: path.join(cwd, ".mcp.json"), type: "json" });
    if (client === "cursor") targets.push({ client, label: "Cursor MCP", path: scope === "project" ? path.join(cwd, ".cursor", "mcp.json") : cursorConfigPath(), type: "json" });
    if (client === "vscode") targets.push({ client, label: "VS Code MCP", path: scope === "project" ? path.join(cwd, ".vscode", "mcp.json") : vscodeMCPPath("global"), type: "json" });
    if (client === "cline") targets.push({ client, label: "Cline MCP", path: scope === "project" ? path.join(cwd, ".cline", "mcp.json") : clineConfigPath(), type: "json" });
    if (client === "windsurf") targets.push({ client, label: "Windsurf MCP", path: scope === "project" ? path.join(cwd, ".windsurf", "mcp_config.json") : windsurfConfigPath(), type: "json" });
    if (client === "opencode") targets.push({ client, label: "OpenCode config", path: opencodeConfigPath(scope, cwd), type: "json" });
    if (client === "copilot") targets.push({ client, label: "GitHub Copilot MCP", path: scope === "project" ? path.join(cwd, ".mcp.json") : githubCopilotConfigPath("global", cwd), type: "json" });
    if (client === "copilot-agent") targets.push({ client, label: "Copilot coding agent MCP", path: path.join(cwd, ".github", "mcp.json"), type: "json" });
    if (client === "grok") targets.push({ client, label: "Grok MCP", path: scope === "project" ? path.join(cwd, ".mcp.json") : homePath(".grok", "mcp.json"), type: "json" });
  }
  return targets;
}

function dispatch(client, action, context, changes) {
  const map = {
    codex: [setupCodex, removeCodex],
    claude: [setupClaude, removeClaude],
    cursor: [setupCursor, removeCursor],
    vscode: [setupVSCode, removeVSCode],
    cline: [setupCline, removeCline],
    windsurf: [setupWindsurf, removeWindsurf],
    opencode: [setupOpenCode, removeOpenCode],
    copilot: [setupCopilot, removeCopilot],
    "copilot-agent": [setupCopilotAgent, removeCopilotAgent],
    grok: [setupGrok, removeGrok],
    gemini: [setupGemini, removeGemini]
  };
  const pair = map[client];
  if (!pair) {
    changes.push(change(client, "unsupported target"));
    return;
  }
  pair[action === "setup" ? 0 : 1](context, changes);
}

function setupCodex(context, changes) {
  let commandConfigured = false;
  if (context.scope === "global" && commandExists("codex")) {
    const commandText = `codex mcp add ${MCP_NAME} --url ${context.endpoint}`;
    if (context.dryRun) {
      changes.push(change("codex-command", `would run ${commandText}`));
    } else {
      run("codex", ["mcp", "remove", MCP_NAME], { allowFailure: true });
      try {
        run("codex", ["mcp", "add", MCP_NAME, "--url", context.endpoint]);
        commandConfigured = true;
        changes.push(change("codex-command", `ran ${commandText}`));
      } catch (error) {
        changes.push(change("codex-command", `codex mcp add failed; writing config fallback (${error.message})`));
      }
    }
  }
  writeCodexConfig(context, changes, commandConfigured ? "codex-config" : "codex");
  installSkill(homePath(".codex", "skills", "oz", "SKILL.md"), context, changes, "codex-skill");
  if (context.scope === "project") {
    upsertMarkdownPolicy(path.join(context.cwd, "AGENTS.md"), context, changes, "codex-agents");
  }
}

function writeCodexConfig(context, changes, label) {
  const configPath = homePath(".codex", "config.toml");
  const nextBlock = [
    "[mcp_servers.oz]",
    `url = ${tomlString(context.endpoint)}`,
    `http_headers = { Authorization = ${tomlString(`Bearer ${context.apiKey}`)} }`,
    "enabled = true"
  ].join("\n");
  const original = exists(configPath) ? readText(configPath) : "";
  const next = `${removeTomlTable(original, "mcp_servers.oz").trimEnd()}\n\n${nextBlock}\n`;
  writeMaybe(configPath, next, context, changes, label);
}

function removeCodex(context, changes) {
  const configPath = homePath(".codex", "config.toml");
  if (exists(configPath)) {
    const next = removeTomlTable(readText(configPath), "mcp_servers.oz");
    writeMaybe(configPath, next, context, changes, "codex");
  }
  removeFile(homePath(".codex", "skills", "oz", "SKILL.md"), context, changes, "codex-skill");
  removeShellEnv(context, changes);
  if (context.scope === "project") {
    removeMarkedPolicy(path.join(context.cwd, "AGENTS.md"), context, changes, "codex-agents");
  }
}

function setupClaude(context, changes) {
  if (context.scope === "project") {
    upsertJSONServer(path.join(context.cwd, ".mcp.json"), ["mcpServers"], MCP_NAME, httpServer(context), context, changes, "claude-project-mcp");
    installSkill(path.join(context.cwd, ".claude", "skills", "oz", "SKILL.md"), context, changes, "claude-project-skill");
    upsertMarkdownPolicy(path.join(context.cwd, "CLAUDE.md"), context, changes, "claude-project-rules");
    return;
  }

  if (commandExists("claude") && !context.dryRun) {
    run("claude", ["mcp", "remove", "--scope", "user", MCP_NAME], { allowFailure: true });
    run("claude", ["mcp", "add-json", "--scope", "user", MCP_NAME, JSON.stringify(httpServer(context))]);
    changes.push(change("claude", "configured Claude Code user MCP via claude mcp add-json"));
  } else {
    changes.push(change("claude", commandExists("claude") ? "would configure Claude Code user MCP" : "Claude Code CLI not found; skipped global MCP config"));
  }
  installSkill(homePath(".claude", "skills", "oz", "SKILL.md"), context, changes, "claude-skill");
}

function removeClaude(context, changes) {
  if (context.scope === "project") {
    removeJSONServer(path.join(context.cwd, ".mcp.json"), ["mcpServers"], MCP_NAME, context, changes, "claude-project-mcp");
    removeFile(path.join(context.cwd, ".claude", "skills", "oz", "SKILL.md"), context, changes, "claude-project-skill");
    removeMarkedPolicy(path.join(context.cwd, "CLAUDE.md"), context, changes, "claude-project-rules");
    return;
  }

  if (commandExists("claude") && !context.dryRun) {
    run("claude", ["mcp", "remove", "--scope", "user", MCP_NAME], { allowFailure: true });
    changes.push(change("claude", "removed Claude Code user MCP"));
  } else {
    changes.push(change("claude", commandExists("claude") ? "would remove Claude Code user MCP" : "Claude Code CLI not found; skipped global MCP removal"));
  }
  removeFile(homePath(".claude", "skills", "oz", "SKILL.md"), context, changes, "claude-skill");
}

function setupCursor(context, changes) {
  const configPath = context.scope === "project" ? path.join(context.cwd, ".cursor", "mcp.json") : cursorConfigPath();
  upsertJSONServer(configPath, ["mcpServers"], MCP_NAME, {
    type: "streamableHttp",
    url: context.endpoint,
    headers: authHeaders(context)
  }, context, changes, "cursor");
  const rulePath = context.scope === "project" ? path.join(context.cwd, ".cursor", "rules", "oz.mdc") : homePath(".cursor", "rules", "oz.mdc");
  writeMaybe(rulePath, CURSOR_RULE, context, changes, "cursor-rule");
}

function removeCursor(context, changes) {
  const configPath = context.scope === "project" ? path.join(context.cwd, ".cursor", "mcp.json") : cursorConfigPath();
  removeJSONServer(configPath, ["mcpServers"], MCP_NAME, context, changes, "cursor");
  const rulePath = context.scope === "project" ? path.join(context.cwd, ".cursor", "rules", "oz.mdc") : homePath(".cursor", "rules", "oz.mdc");
  removeFile(rulePath, context, changes, "cursor-rule");
}

function setupVSCode(context, changes) {
  const configPath = context.scope === "project" ? path.join(context.cwd, ".vscode", "mcp.json") : vscodeMCPPath("global");
  upsertJSONServer(configPath, ["servers"], MCP_NAME, {
    type: "http",
    url: context.endpoint,
    headers: authHeaders(context)
  }, context, changes, "vscode");
  if (context.scope === "project") {
    upsertMarkdownPolicy(path.join(context.cwd, ".github", "copilot-instructions.md"), context, changes, "vscode-copilot-instructions");
  }
}

function removeVSCode(context, changes) {
  const configPath = context.scope === "project" ? path.join(context.cwd, ".vscode", "mcp.json") : vscodeMCPPath("global");
  removeJSONServer(configPath, ["servers"], MCP_NAME, context, changes, "vscode");
  if (context.scope === "project") {
    removeMarkedPolicy(path.join(context.cwd, ".github", "copilot-instructions.md"), context, changes, "vscode-copilot-instructions");
  }
}

function setupCline(context, changes) {
  const configPath = context.scope === "project" ? path.join(context.cwd, ".cline", "mcp.json") : clineConfigPath();
  upsertJSONServer(configPath, ["mcpServers"], MCP_NAME, {
    type: "http",
    url: context.endpoint,
    headers: authHeaders(context)
  }, context, changes, "cline");
  if (context.scope === "project") {
    upsertMarkdownPolicy(path.join(context.cwd, "AGENTS.md"), context, changes, "cline-agents");
  }
}

function removeCline(context, changes) {
  const configPath = context.scope === "project" ? path.join(context.cwd, ".cline", "mcp.json") : clineConfigPath();
  removeJSONServer(configPath, ["mcpServers"], MCP_NAME, context, changes, "cline");
  if (context.scope === "project") {
    removeMarkedPolicy(path.join(context.cwd, "AGENTS.md"), context, changes, "cline-agents");
  }
}

function setupWindsurf(context, changes) {
  const configPath = context.scope === "project" ? path.join(context.cwd, ".windsurf", "mcp_config.json") : windsurfConfigPath();
  upsertJSONServer(configPath, ["mcpServers"], MCP_NAME, {
    serverUrl: context.endpoint,
    headers: authHeaders(context)
  }, context, changes, "windsurf");
  const rulePath = context.scope === "project" ? path.join(context.cwd, ".windsurfrules") : homePath(".windsurfrules");
  upsertPlainMarkedPolicy(rulePath, context, changes, "windsurf-rules");
}

function removeWindsurf(context, changes) {
  const configPath = context.scope === "project" ? path.join(context.cwd, ".windsurf", "mcp_config.json") : windsurfConfigPath();
  removeJSONServer(configPath, ["mcpServers"], MCP_NAME, context, changes, "windsurf");
  const rulePath = context.scope === "project" ? path.join(context.cwd, ".windsurfrules") : homePath(".windsurfrules");
  removeMarkedPolicy(rulePath, context, changes, "windsurf-rules");
}

function setupOpenCode(context, changes) {
  const configPath = opencodeConfigPath(context.scope, context.cwd);
  upsertJSONServer(configPath, ["mcp"], MCP_NAME, {
    type: "remote",
    url: context.endpoint,
    enabled: true,
    headers: authHeaders(context)
  }, context, changes, "opencode");
  if (context.scope === "project") {
    upsertMarkdownPolicy(path.join(context.cwd, "AGENTS.md"), context, changes, "opencode-agents");
  }
}

function removeOpenCode(context, changes) {
  removeJSONServer(opencodeConfigPath(context.scope, context.cwd), ["mcp"], MCP_NAME, context, changes, "opencode");
  if (context.scope === "project") {
    removeMarkedPolicy(path.join(context.cwd, "AGENTS.md"), context, changes, "opencode-agents");
  }
}

function setupCopilot(context, changes) {
  const configPath = context.scope === "project" ? path.join(context.cwd, ".mcp.json") : githubCopilotConfigPath("global", context.cwd);
  upsertJSONServer(configPath, ["servers"], MCP_NAME, {
    type: "http",
    url: context.endpoint,
    headers: authHeaders(context)
  }, context, changes, "copilot");
  if (context.scope === "project") {
    upsertMarkdownPolicy(path.join(context.cwd, ".github", "copilot-instructions.md"), context, changes, "copilot-instructions");
  }
}

function removeCopilot(context, changes) {
  const configPath = context.scope === "project" ? path.join(context.cwd, ".mcp.json") : githubCopilotConfigPath("global", context.cwd);
  removeJSONServer(configPath, ["servers"], MCP_NAME, context, changes, "copilot");
  if (context.scope === "project") {
    removeMarkedPolicy(path.join(context.cwd, ".github", "copilot-instructions.md"), context, changes, "copilot-instructions");
  }
}

function setupCopilotAgent(context, changes) {
  upsertJSONServer(path.join(context.cwd, ".github", "mcp.json"), ["servers"], MCP_NAME, {
    type: "http",
    url: context.endpoint,
    headers: authHeaders(context)
  }, context, changes, "copilot-agent");
  upsertMarkdownPolicy(path.join(context.cwd, ".github", "copilot-instructions.md"), context, changes, "copilot-agent-instructions");
}

function removeCopilotAgent(context, changes) {
  removeJSONServer(path.join(context.cwd, ".github", "mcp.json"), ["servers"], MCP_NAME, context, changes, "copilot-agent");
  removeMarkedPolicy(path.join(context.cwd, ".github", "copilot-instructions.md"), context, changes, "copilot-agent-instructions");
}

function setupGrok(context, changes) {
  const configPath = context.scope === "project" ? path.join(context.cwd, ".mcp.json") : homePath(".grok", "mcp.json");
  upsertJSONServer(configPath, ["mcpServers"], MCP_NAME, httpServer(context), context, changes, "grok");
  const rulePath = context.scope === "project" ? path.join(context.cwd, "AGENTS.md") : homePath(".grok", "AGENTS.md");
  upsertMarkdownPolicy(rulePath, context, changes, "grok-agents");
}

function removeGrok(context, changes) {
  const configPath = context.scope === "project" ? path.join(context.cwd, ".mcp.json") : homePath(".grok", "mcp.json");
  removeJSONServer(configPath, ["mcpServers"], MCP_NAME, context, changes, "grok");
  const rulePath = context.scope === "project" ? path.join(context.cwd, "AGENTS.md") : homePath(".grok", "AGENTS.md");
  removeMarkedPolicy(rulePath, context, changes, "grok-agents");
}

function setupGemini(context, changes) {
  const rulePath = context.scope === "project" ? path.join(context.cwd, "GEMINI.md") : homePath(".gemini", "GEMINI.md");
  upsertMarkdownPolicy(rulePath, context, changes, "gemini-rules");
}

function removeGemini(context, changes) {
  const rulePath = context.scope === "project" ? path.join(context.cwd, "GEMINI.md") : homePath(".gemini", "GEMINI.md");
  removeMarkedPolicy(rulePath, context, changes, "gemini-rules");
}

function upsertJSONServer(filePath, objectPath, key, value, context, changes, label) {
  const doc = readJSON(filePath, {});
  let cursor = doc;
  for (const part of objectPath) {
    if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[key] = value;
  writeMaybeJSON(filePath, doc, context, changes, label);
}

function removeJSONServer(filePath, objectPath, key, context, changes, label) {
  if (!exists(filePath)) return;
  const doc = readJSON(filePath, {});
  let cursor = doc;
  for (const part of objectPath) {
    if (!cursor[part] || typeof cursor[part] !== "object") return;
    cursor = cursor[part];
  }
  delete cursor[key];
  writeMaybeJSON(filePath, doc, context, changes, label);
}

function upsertMarkdownPolicy(filePath, context, changes, label) {
  const original = exists(filePath) ? readText(filePath) : "";
  writeMaybe(filePath, upsertMarkedBlock(original, BLOCK, AGENTS_POLICY), context, changes, label);
}

function upsertPlainMarkedPolicy(filePath, context, changes, label) {
  upsertMarkdownPolicy(filePath, context, changes, label);
}

function removeMarkedPolicy(filePath, context, changes, label) {
  if (!exists(filePath)) return;
  writeMaybe(filePath, removeMarkedBlock(readText(filePath), BLOCK), context, changes, label);
}

function installSkill(filePath, context, changes, label) {
  writeMaybe(filePath, SKILL_TEXT, context, changes, label);
}

function removeFile(filePath, context, changes, label) {
  if (!exists(filePath)) return;
  if (!context.dryRun) {
    fs.rmSync(filePath, { force: true });
  }
  changes.push(change(label, `${context.dryRun ? "would remove" : "removed"} ${displayPath(filePath)}`));
}

function removeShellEnv(context, changes) {
  for (const filePath of [homePath(".zshrc"), homePath(".bashrc")]) {
    if (!exists(filePath)) continue;
    const original = readText(filePath);
    const next = removeShellBlock(original);
    if (next !== original) writeMaybe(filePath, next, context, changes, "legacy-codex-shell-env");
  }
}

function removeShellBlock(content) {
  const begin = "# BEGIN OZ API KEY";
  const end = "# END OZ API KEY";
  const pattern = new RegExp(`\\n?${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "m");
  const next = content.replace(pattern, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  return next ? `${next}\n` : "";
}

function writeMaybeJSON(filePath, value, context, changes, label) {
  if (!context.dryRun) {
    writeJSON(filePath, value, { backup: true });
  }
  changes.push(change(label, `${context.dryRun ? "would update" : "updated"} ${displayPath(filePath)}`));
}

function writeMaybe(filePath, content, context, changes, label) {
  if (!context.dryRun) {
    writeText(filePath, content, { backup: true });
  }
  changes.push(change(label, `${context.dryRun ? "would update" : "updated"} ${displayPath(filePath)}`));
}

function removeTomlTable(content, tableName) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let skipping = false;
  const header = `[${tableName}]`;
  for (const line of lines) {
    if (line.trim() === header) {
      skipping = true;
      continue;
    }
    if (skipping && /^\s*\[[^\]]+\]\s*$/.test(line)) {
      skipping = false;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, { stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function httpServer(context) {
  return {
    type: "http",
    url: context.endpoint,
    headers: authHeaders(context)
  };
}

function authHeaders(context) {
  return { Authorization: `Bearer ${context.apiKey}` };
}

function cursorConfigPath() {
  return homePath(".cursor", "mcp.json");
}

function clineConfigPath() {
  return homePath(".cline", "mcp.json");
}

function clineExtensionConfigPath() {
  if (process.platform === "darwin") return homePath("Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
  if (process.platform === "win32") return path.join(process.env.APPDATA || homePath("AppData", "Roaming"), "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
  return homePath(".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
}

function vscodeUserDir() {
  if (process.platform === "darwin") return homePath("Library", "Application Support", "Code", "User");
  if (process.platform === "win32") return path.join(process.env.APPDATA || homePath("AppData", "Roaming"), "Code", "User");
  return homePath(".config", "Code", "User");
}

function vscodeMCPPath(scope) {
  if (scope === "global") return path.join(vscodeUserDir(), "mcp.json");
  return path.join(scope, ".vscode", "mcp.json");
}

function windsurfConfigPath() {
  return homePath(".codeium", "windsurf", "mcp_config.json");
}

function opencodeConfigPath(scope, cwd = process.cwd()) {
  if (scope === "project") return path.join(cwd, "opencode.json");
  if (process.platform === "darwin") return homePath("Library", "Application Support", "opencode", "opencode.json");
  if (process.platform === "win32") return path.join(process.env.APPDATA || homePath("AppData", "Roaming"), "opencode", "opencode.json");
  return homePath(".config", "opencode", "opencode.json");
}

function githubCopilotConfigPath(scope, cwd = process.cwd()) {
  if (scope === "project") return path.join(cwd, ".mcp.json");
  if (process.platform === "darwin") return homePath("Library", "Application Support", "github-copilot", "mcp.json");
  if (process.platform === "win32") return path.join(process.env.APPDATA || homePath("AppData", "Roaming"), "github-copilot", "mcp.json");
  return homePath(".config", "github-copilot", "mcp.json");
}

function displayPath(filePath) {
  return filePath.replace(os.homedir(), "~");
}

function tomlString(value) {
  return JSON.stringify(value);
}

function change(client, message) {
  return { client, message };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  configTargets,
  detectClients,
  removeClients,
  setupClients,
  paths: {
    clineConfigPath,
    cursorConfigPath,
    githubCopilotConfigPath,
    opencodeConfigPath,
    vscodeMCPPath,
    windsurfConfigPath
  },
  internals: {
    removeShellBlock,
    removeTomlTable
  }
};
