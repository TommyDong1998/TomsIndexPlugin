'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  installClaudeHook,
  uninstallClaudeHook,
  installClaudeMd,
  uninstallClaudeMd,
  mergeClaudeSettings,
} = require('../src/claude/config');
const {
  installCodex,
  uninstallCodex,
} = require('../src/codex/config');
const {
  installCursor,
  uninstallCursor,
  cursorConfigPath,
} = require('../src/cursor/config');
const {
  ensureFeature,
  removeFeature,
  binPath,
  BEGIN,
  END,
} = require('../src/shared/config');
const { resolveApiKey } = require('../src/cli');

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tomsindex-test-'));
}

test('mergeClaudeSettings preserves existing hooks and adds managed hook once', () => {
  const existing = {
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo old' }] }],
    },
  };
  const once = mergeClaudeSettings(existing);
  const twice = mergeClaudeSettings(once);
  assert.equal(twice.hooks.UserPromptSubmit.length, 2);
  assert.equal(twice.hooks.UserPromptSubmit[0].hooks[0].command, 'echo old');
  assert.match(twice.hooks.UserPromptSubmit[1].hooks[0].command, /tomsindex\.js' hook claude$/);
});

test('installClaudeHook writes user settings and uninstall removes only managed hook', () => {
  const home = tempHome();
  const file = path.join(home, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo old' }] }] } }));

  installClaudeHook({ home });
  const installed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(installed.hooks.UserPromptSubmit.length, 2);

  uninstallClaudeHook({ home });
  const removed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(removed.hooks.UserPromptSubmit.length, 1);
  assert.equal(removed.hooks.UserPromptSubmit[0].hooks[0].command, 'echo old');
});

test('ensureFeature updates existing features table', () => {
  const result = ensureFeature('[features]\nmulti_agent = true\n\n[tui]\nfoo = "bar"\n', 'hooks', 'true');
  assert.match(result, /\[features\]\nmulti_agent = true\nhooks = true\n\n\[tui\]/);
});

test('removeFeature removes only the requested feature key', () => {
  const result = removeFeature('[features]\nmulti_agent = true\ncodex_hooks = true\nhooks = true\n\n[tui]\nfoo = "bar"\n', 'codex_hooks');
  assert.doesNotMatch(result, /codex_hooks/);
  assert.match(result, /multi_agent = true/);
  assert.match(result, /hooks = true/);
});

test('installCodex appends idempotent managed block and uninstall removes it', () => {
  const home = tempHome();
  const file = path.join(home, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'model = "gpt-5.5"\n\n[features]\nmulti_agent = true\n');

  installCodex({ home, url: 'https://api.example.test', apiKey: 'srch_test' });
  installCodex({ home, url: 'https://api.example.test', apiKey: 'srch_test' });
  const installed = fs.readFileSync(file, 'utf8');
  assert.equal((installed.match(/\[mcp_servers\.tomsindex\]/g) || []).length, 1);
  assert.match(installed, /hooks = true/);
  assert.match(installed, /TOMSINDEX_API_KEY = "srch_test"/);
  assert.match(installed, new RegExp(`command = ${JSON.stringify(process.execPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(installed, new RegExp(JSON.stringify(binPath()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(installed, /\[\[hooks\.UserPromptSubmit\]\]/);
  assert.match(installed, /\[\[hooks\.UserPromptSubmit\.hooks\]\]/);
  assert.match(installed, /type = "command"/);

  uninstallCodex({ home });
  const removed = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(removed, /tomsindex/);
  assert.match(removed, /multi_agent = true/);
});

test('installCodex removes deprecated codex_hooks feature from existing config', () => {
  const home = tempHome();
  const file = path.join(home, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '[features]\ncodex_hooks = true\n');

  installCodex({ home, url: 'https://tomsindex.com', apiKey: 'srch_test' });
  const installed = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(installed, /codex_hooks/);
  assert.match(installed, /hooks = true/);
});

test('mergeClaudeSettings embeds current env vars in hook command', () => {
  const result = mergeClaudeSettings({}, { url: 'https://example.com', apiKey: 'srch_abc', askMode: 'generate' });
  const command = result.hooks.UserPromptSubmit[0].hooks[0].command;
  assert.match(command, /TOMSINDEX_URL='https:\/\/example\.com'/);
  assert.match(command, /TOMSINDEX_API_KEY='srch_abc'/);
  assert.doesNotMatch(command, /TOMSINDEX_ASK_MODE/);
  assert.match(command, /hook claude$/);
});

test('resolveApiKey accepts explicit key and rejects wrong prefix', async () => {
  assert.equal(await resolveApiKey({ 'api-key': 'srch_test' }), 'srch_test');
  await assert.rejects(
    () => resolveApiKey({ 'api-key': 'bad_test' }),
    /Expected a key starting with srch_/,
  );
});

test('installClaudeMd writes managed block and uninstall removes it', () => {
  const home = tempHome();
  const file = path.join(home, '.claude', 'CLAUDE.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '# My Instructions\n\nExisting content here.\n');

  installClaudeMd({ home });
  const installed = fs.readFileSync(file, 'utf8');
  assert.match(installed, /Existing content here/);
  assert.match(installed, new RegExp(BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(installed, /tool selection/);
  assert.match(installed, /tomsindex_solutions/);
  assert.match(installed, /tomsindex_search/);
  assert.match(installed, /tomsindex_hint/);

  // Idempotent
  installClaudeMd({ home });
  const twice = fs.readFileSync(file, 'utf8');
  assert.equal((twice.match(new RegExp(BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1);

  uninstallClaudeMd({ home });
  const removed = fs.readFileSync(file, 'utf8');
  assert.match(removed, /Existing content here/);
  assert.doesNotMatch(removed, /tomsindex_solutions/);
});

test('installClaudeMd creates file if it does not exist', () => {
  const home = tempHome();
  installClaudeMd({ home });
  const file = path.join(home, '.claude', 'CLAUDE.md');
  const content = fs.readFileSync(file, 'utf8');
  assert.match(content, /tool selection/);
});

test('installCodex does not include deprecated TOMSINDEX_ASK_MODE in managed block', () => {
  const home = tempHome();
  const file = path.join(home, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');

  installCodex({ home, url: 'https://tomsindex.com', apiKey: 'srch_test', askMode: 'lookup' });
  const installed = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(installed, /TOMSINDEX_ASK_MODE/);
});

test('installCursor writes MCP config and uninstall removes it', () => {
  const home = tempHome();
  installCursor({ home, url: 'https://tomsindex.com', apiKey: 'srch_test', askMode: 'generate' });
  const file = cursorConfigPath({ home });
  const installed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(installed.mcpServers.tomsindex);
  assert.equal(installed.mcpServers.tomsindex.env.TOMSINDEX_API_KEY, 'srch_test');
  assert.equal(installed.mcpServers.tomsindex.env.TOMSINDEX_ASK_MODE, undefined);
  assert.match(installed.mcpServers.tomsindex.args[0], /tomsindex\.js$/);

  uninstallCursor({ home });
  const removed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(removed.mcpServers, undefined);
});

test('installCursor is idempotent', () => {
  const home = tempHome();
  installCursor({ home, url: 'https://tomsindex.com', apiKey: 'srch_test' });
  installCursor({ home, url: 'https://tomsindex.com', apiKey: 'srch_test' });
  const file = cursorConfigPath({ home });
  const installed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(Object.keys(installed.mcpServers).length, 1);
});

test('installCursor preserves existing MCP servers', () => {
  const home = tempHome();
  const file = cursorConfigPath({ home });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { other: { command: 'echo' } } }));

  installCursor({ home, url: 'https://tomsindex.com', apiKey: 'srch_test' });
  const installed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(installed.mcpServers.other);
  assert.ok(installed.mcpServers.tomsindex);
});
