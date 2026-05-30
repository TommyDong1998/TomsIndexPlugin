'use strict';

const fs = require('fs');
const path = require('path');
const {
  BEGIN,
  END,
  homeDir,
  ensureDir,
  backupFile,
  stripManagedBlock,
  quoteToml,
  ensureFeature,
  removeFeature,
  hookCommand,
  nodeCommandArgs,
} = require('../shared/config');

function codexManagedBlock({ url, apiKey, publicOnly = false } = {}) {
  const envLines = [`TOMSINDEX_URL = ${quoteToml(url || 'https://tomsindex.com')}`];
  if (!publicOnly && apiKey) envLines.push(`TOMSINDEX_API_KEY = ${quoteToml(apiKey)}`);
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
  codexConfigPath,
  codexManagedBlock,
  installCodex,
  uninstallCodex,
};
