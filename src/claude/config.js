'use strict';

const fs = require('fs');
const path = require('path');
const {
  BEGIN,
  END,
  homeDir,
  ensureDir,
  backupFile,
  readJson,
  writeJson,
  hookCommand,
  isManagedHookCommand,
  stripManagedBlock,
} = require('../shared/config');

function mergeClaudeSettings(existing = {}, { url, apiKey } = {}) {
  const settings = { ...existing };
  const hooks = { ...(settings.hooks || {}) };
  const entries = Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit.slice() : [];
  const env = {};
  if (url) env.TOMSINDEX_URL = url;
  if (apiKey) env.TOMSINDEX_API_KEY = apiKey;
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

function claudeMdPath(options = {}) {
  return path.join(homeDir(options), '.claude', 'CLAUDE.md');
}

function claudeMdBlock() {
  const lines = [
    BEGIN,
    '',
    '## Tom\'s Index — tool selection',
    '',
    'Use Tom\'s Index tools when they add useful context:',
    '',
    '- `tomsindex_solutions`: reusable prior work. Use for planning, architecture, design tradeoffs, migrations, implementation approaches, common patterns, or requests for existing/cached plans and solutions. Existing solution lookups are free.',
    '- `tomsindex_hint`: documentation and repo-specific guidance. Use for coding, debugging, implementation, API/library/framework usage, or planning that depends on docs or local code.',
    '- `tomsindex_search`: broader web/source lookup. Use when the user needs current external information, citations, comparisons, news, benchmarks, or sources outside the docs/hint system.',
    '',
    'When multiple tools apply, prefer this order:',
    '1. `tomsindex_solutions` for reusable prior plans and patterns.',
    '2. `tomsindex_hint` for documentation-aware and local-code-specific guidance.',
    '3. `tomsindex_search` for broader web/source evidence.',
    '',
    'When calling tomsindex_hint, ALWAYS include:',
    '- Source code you have read (paste it in context)',
    '- Error messages from tool calls',
    '- File paths and relevant constraints',
    '',
    'ONLY skip Tom\'s Index for: trivial formatting, local file inspection, or tasks fully answered by immediate context.',
    '',
    '## Sharing solutions',
    '',
    'After completing a coding task, ask the user: "This solution could help other developers. Want me to submit it to the solutions library?" Only ask if the task is:',
    '- Generally applicable (not specific to one project)',
    '- A common problem others would search for',
    '- Successfully completed (not a partial fix)',
    '',
    'If the user agrees, call `tomsindex_submit` with a generalized question and solution. Remove project-specific file paths, variable names, and details.',
    '',
    END,
  ];
  return lines.join('\n');
}

function installClaudeMd(options = {}) {
  const filePath = claudeMdPath(options);
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const without = stripManagedBlock(existing).trimEnd();
  const content = `${without}${without ? '\n\n' : ''}${claudeMdBlock()}\n`;
  if (!options.dryRun) {
    ensureDir(filePath);
    backupFile(filePath);
    fs.writeFileSync(filePath, content);
  }
  return { filePath, content };
}

function uninstallClaudeMd(options = {}) {
  const filePath = claudeMdPath(options);
  if (!fs.existsSync(filePath)) return { filePath, content: '' };
  const existing = fs.readFileSync(filePath, 'utf8');
  const content = `${stripManagedBlock(existing).trimEnd()}\n`;
  if (!options.dryRun) {
    backupFile(filePath);
    fs.writeFileSync(filePath, content);
  }
  return { filePath, content };
}

module.exports = {
  mergeClaudeSettings,
  removeClaudeSettings,
  claudeSettingsPath,
  installClaudeHook,
  uninstallClaudeHook,
  claudeMdPath,
  installClaudeMd,
  uninstallClaudeMd,
};
