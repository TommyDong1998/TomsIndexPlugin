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
  return path.resolve(__dirname, '..', 'bin', 'tomsindex.js');
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

function mergeClaudeSettings(existing = {}, { url, apiKey, askMode } = {}) {
  const settings = { ...existing };
  const hooks = { ...(settings.hooks || {}) };
  const entries = Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit.slice() : [];
  const env = {};
  if (url) env.TOMSINDEX_URL = url;
  if (apiKey) env.TOMSINDEX_API_KEY = apiKey;
  if (askMode) env.TOMSINDEX_ASK_MODE = askMode;
  const command = hookCommand('claude', env);
  const withoutManaged = entries.filter((entry) => {
    const hs = Array.isArray(entry?.hooks) ? entry.hooks : [];
    return !hs.some((hook) => hook?.command === command || isManagedHookCommand(hook?.command, 'claude'));
  });
  withoutManaged.push({
    hooks: [{ type: 'command', command, timeout: 5 }],
  });
  hooks.UserPromptSubmit = withoutManaged;
  settings.hooks = hooks;
  return settings;
}

function removeClaudeSettings(existing = {}) {
  const settings = { ...existing };
  if (!settings.hooks?.UserPromptSubmit) return settings;
  settings.hooks = { ...settings.hooks };
  settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter((entry) => {
    const hs = Array.isArray(entry?.hooks) ? entry.hooks : [];
    return !hs.some((hook) => isManagedHookCommand(hook?.command, 'claude'));
  });
  if (settings.hooks.UserPromptSubmit.length === 0) delete settings.hooks.UserPromptSubmit;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return settings;
}

function claudeSettingsPath(options = {}) {
  return path.join(homeDir(options), '.claude', 'settings.json');
}

function installClaudeHook(options = {}) {
  const filePath = claudeSettingsPath(options);
  const merged = mergeClaudeSettings(readJson(filePath), options);
  return { filePath, content: writeJson(filePath, merged, options) };
}

function uninstallClaudeHook(options = {}) {
  const filePath = claudeSettingsPath(options);
  const merged = removeClaudeSettings(readJson(filePath));
  return { filePath, content: writeJson(filePath, merged, options) };
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

function codexManagedBlock({ url, apiKey, publicOnly = false, askMode = 'generate' } = {}) {
  const envLines = [`TOMSINDEX_URL = ${quoteToml(url || 'https://tomsindex.com')}`];
  if (!publicOnly && apiKey) envLines.push(`TOMSINDEX_API_KEY = ${quoteToml(apiKey)}`);
  envLines.push(`TOMSINDEX_ASK_MODE = ${quoteToml(askMode)}`);
  const [mcpBin, mcpCommand] = nodeCommandArgs('mcp');
  return `${BEGIN}
[mcp_servers.tomsindex]
command = ${quoteToml(process.execPath)}
args = [${quoteToml(mcpBin)}, ${quoteToml(mcpCommand)}]
startup_timeout_sec = 10
tool_timeout_sec = 60

[mcp_servers.tomsindex.env]
${envLines.join('\n')}

[[hooks.UserPromptSubmit]]
[[hooks.UserPromptSubmit.hooks]]
type = "command"
command = ${quoteToml(hookCommand('codex'))}
timeout = 5
statusMessage = "Adding Tom's Index context"
${END}`;
}

function codexConfigPath(options = {}) {
  return path.join(homeDir(options), '.codex', 'config.toml');
}

function installCodex(options = {}) {
  const filePath = codexConfigPath(options);
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const without = removeFeature(stripManagedBlock(existing), 'codex_hooks');
  const withFeature = ensureFeature(without, 'hooks', 'true').trimEnd();
  const content = `${withFeature}\n\n${codexManagedBlock(options)}\n`;
  if (!options.dryRun) {
    ensureDir(filePath);
    backupFile(filePath);
    fs.writeFileSync(filePath, content);
  }
  return { filePath, content };
}

function uninstallCodex(options = {}) {
  const filePath = codexConfigPath(options);
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const content = `${stripManagedBlock(existing).trimEnd()}\n`;
  if (!options.dryRun) {
    ensureDir(filePath);
    backupFile(filePath);
    fs.writeFileSync(filePath, content);
  }
  return { filePath, content };
}

module.exports = {
  BEGIN,
  END,
  backupFile,
  claudeSettingsPath,
  codexConfigPath,
  hookCommand,
  isManagedHookCommand,
  installClaudeHook,
  uninstallClaudeHook,
  installCodex,
  uninstallCodex,
  mergeClaudeSettings,
  removeClaudeSettings,
  binPath,
  stripManagedBlock,
  ensureFeature,
  removeFeature,
};
