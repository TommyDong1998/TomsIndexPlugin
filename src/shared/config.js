'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const BEGIN = '# >>> tomsindex managed block >>>';
const END = '# <<< tomsindex managed block <<<';

function homeDir(options = {}) {
  return options.home || process.env.HOME || os.homedir();
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const backup = `${filePath}.bak.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(filePath, backup);
  return backup;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return {};
  return JSON.parse(text);
}

function writeJson(filePath, data, { dryRun = false } = {}) {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  if (!dryRun) {
    ensureDir(filePath);
    backupFile(filePath);
    fs.writeFileSync(filePath, text);
  }
  return text;
}

function binPath() {
  return path.resolve(__dirname, '..', '..', 'bin', 'tomsindex.js');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function nodeCommandArgs(subcommand) {
  return [binPath(), subcommand];
}

function hookCommand(client, env = {}) {
  const envPrefix = Object.entries(env)
    .map(([k, v]) => `${k}=${shellQuote(v)}`)
    .join(' ');
  const cmd = `${shellQuote(process.execPath)} ${shellQuote(binPath())} hook ${client}`;
  return envPrefix ? `${envPrefix} ${cmd}` : cmd;
}

function isManagedHookCommand(command, client) {
  const text = String(command || '');
  return text.includes(`tomsindex hook ${client}`) || (text.includes('tomsindex.js') && text.includes(`hook ${client}`));
}

function stripManagedBlock(text) {
  const pattern = new RegExp(`\\n?${escapeRegExp(BEGIN)}[\\s\\S]*?${escapeRegExp(END)}\\n?`, 'g');
  return text.replace(pattern, '\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quoteToml(value) {
  return JSON.stringify(String(value));
}

function ensureFeature(text, key, value) {
  const lines = text.split('\n');
  let start = lines.findIndex((line) => line.trim() === '[features]');
  if (start === -1) {
    const prefix = text.trimEnd();
    return `${prefix}${prefix ? '\n\n' : ''}[features]\n${key} = ${value}\n`;
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[/.test(lines[i])) {
      end = i;
      break;
    }
  }
  let found = false;
  for (let i = start + 1; i < end; i += 1) {
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(lines[i])) {
      lines[i] = `${key} = ${value}`;
      found = true;
    }
  }
  if (!found) {
    let insertAt = end;
    while (insertAt > start + 1 && lines[insertAt - 1].trim() === '') insertAt -= 1;
    lines.splice(insertAt, 0, `${key} = ${value}`);
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function removeFeature(text, key) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === '[features]');
  if (start === -1) return text;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[/.test(lines[i])) {
      end = i;
      break;
    }
  }

  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  return `${lines.filter((line, idx) => idx <= start || idx >= end || !pattern.test(line)).join('\n').trimEnd()}\n`;
}

module.exports = {
  BEGIN,
  END,
  homeDir,
  ensureDir,
  backupFile,
  readJson,
  writeJson,
  binPath,
  shellQuote,
  nodeCommandArgs,
  hookCommand,
  isManagedHookCommand,
  stripManagedBlock,
  escapeRegExp,
  quoteToml,
  ensureFeature,
  removeFeature,
};
