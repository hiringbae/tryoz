"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function homeDir() {
  return process.env.TRYOZ_TEST_HOME || os.homedir();
}

function homePath(...parts) {
  return path.join(homeDir(), ...parts);
}

function exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, content, options = {}) {
  ensureDir(path.dirname(filePath));
  if (options.backup && exists(filePath)) {
    backupFile(filePath);
  }
  fs.writeFileSync(filePath, content);
}

function readJSON(filePath, fallback = {}) {
  if (!exists(filePath)) return fallback;
  const raw = readText(filePath).trim();
  if (!raw) return fallback;
  return JSON.parse(raw);
}

function writeJSON(filePath, value, options = {}) {
  writeText(filePath, JSON.stringify(value, null, 2) + "\n", options);
}

function backupFile(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function upsertMarkedBlock(content, name, block) {
  const begin = `<!-- BEGIN ${name} -->`;
  const end = `<!-- END ${name} -->`;
  const normalized = `${begin}\n${block.trim()}\n${end}`;
  const pattern = new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`, "m");
  if (pattern.test(content)) {
    return content.replace(pattern, normalized);
  }
  const prefix = content.trim() ? `${content.trimEnd()}\n\n` : "";
  return `${prefix}${normalized}\n`;
}

function removeMarkedBlock(content, name) {
  const begin = `<!-- BEGIN ${name} -->`;
  const end = `<!-- END ${name} -->`;
  const pattern = new RegExp(`\\n?${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "m");
  const next = content.replace(pattern, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  return next ? `${next}\n` : "";
}

function commandExists(command) {
  const paths = String(process.env.PATH || "").split(path.delimiter);
  const extensions = process.platform === "win32" ? ["", ".cmd", ".exe", ".bat"] : [""];
  for (const entry of paths) {
    for (const ext of extensions) {
      if (exists(path.join(entry, command + ext))) return true;
    }
  }
  return false;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  backupFile,
  commandExists,
  ensureDir,
  exists,
  homeDir,
  homePath,
  readJSON,
  readText,
  removeMarkedBlock,
  upsertMarkedBlock,
  writeJSON,
  writeText
};
