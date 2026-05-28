"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ENDPOINT = "https://tryoz.dev/mcp";
const TELEMETRY_ENDPOINT = "https://tryoz.dev/api/v1/telemetry/cli";

const CLIENTS = [
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
];

const CLIENT_META = {
  codex: {
    label: "Codex CLI / Codex IDE",
    short: "Codex",
    description: "OpenAI Codex CLI and Codex IDE shared MCP config"
  },
  claude: {
    label: "Claude Code",
    short: "Claude",
    description: "Claude Code MCP and Agent Skills"
  },
  cursor: {
    label: "Cursor",
    short: "Cursor",
    description: "Cursor MCP config and project rules"
  },
  vscode: {
    label: "VS Code / GitHub Copilot",
    short: "VS Code",
    description: "VS Code MCP config and Copilot instructions"
  },
  cline: {
    label: "Cline",
    short: "Cline",
    description: "Cline MCP config"
  },
  windsurf: {
    label: "Windsurf",
    short: "Windsurf",
    description: "Windsurf MCP config and project rules"
  },
  opencode: {
    label: "OpenCode",
    short: "OpenCode",
    description: "OpenCode MCP config and AGENTS.md policy"
  },
  copilot: {
    label: "GitHub Copilot CLI",
    short: "Copilot CLI",
    description: "GitHub Copilot CLI project MCP config"
  },
  "copilot-agent": {
    label: "GitHub Copilot Coding Agent",
    short: "Copilot Agent",
    description: "Repository MCP config for Copilot coding agent"
  },
  grok: {
    label: "Grok Build",
    short: "Grok",
    description: "Grok Build project MCP and AGENTS.md policy"
  },
  gemini: {
    label: "Gemini CLI",
    short: "Gemini",
    description: "Gemini project instructions"
  }
};

const SKILL_TEXT = readTemplate("skills", "oz", "SKILL.md");
const AGENTS_POLICY = readTemplate("rules", "oz-policy.md");
const OZ_POLICY = AGENTS_POLICY.replace(/^## Oz Documentation Policy\s+/m, "");
const CURSOR_RULE = `---
description: Oz documentation policy
alwaysApply: true
---

${OZ_POLICY}`;

function readTemplate(...parts) {
  return fs.readFileSync(path.join(__dirname, "..", "templates", ...parts), "utf8").trimEnd() + "\n";
}

module.exports = {
  AGENTS_POLICY,
  CLIENT_META,
  CLIENTS,
  CURSOR_RULE,
  DEFAULT_ENDPOINT,
  OZ_POLICY,
  SKILL_TEXT,
  TELEMETRY_ENDPOINT
};
