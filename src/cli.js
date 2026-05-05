'use strict';

const fs = require('fs');
const readline = require('readline/promises');
const { spawnSync } = require('child_process');
const { runMcp } = require('./shared/mcp');
const { runHook } = require('./shared/hook');
const { binPath } = require('./shared/config');
const {
  claudeSettingsPath,
  installClaudeHook,
  uninstallClaudeHook,
  installClaudeMd,
  uninstallClaudeMd,
} = require('./claude/config');
const {
  codexConfigPath,
  installCodex,
  uninstallCodex,
} = require('./codex/config');
const {
  cursorConfigPath,
  installCursor,
  uninstallCursor,
} = require('./cursor/config');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }
    const raw = arg.slice(2);
    const eq = raw.indexOf('=');
    if (eq !== -1) {
      args[raw.slice(0, eq)] = raw.slice(eq + 1);
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[raw] = argv[++i];
    } else {
      args[raw] = true;
    }
  }
  return args;
}

function help() {
  return `Usage:
  tomsindex
  tomsindex install [--client claude|codex|cursor|all] [--url URL] [--api-key KEY] [--public-only] [--ask-mode lookup|generate] [--dry-run] [--home PATH]
  tomsindex uninstall [--client claude|codex|cursor|all] [--dry-run] [--home PATH]
  tomsindex doctor [--home PATH]
  tomsindex mcp
  tomsindex hook claude|codex

Get an API key: https://tomsindex.com/quick-key`;
}

function clients(value) {
  const selected = value || 'all';
  if (selected === 'all' || selected === 'both') return ['claude', 'codex', 'cursor'];
  if (selected === 'claude' || selected === 'codex' || selected === 'cursor') return [selected];
  throw new Error(`Unknown client: ${selected}`);
}

async function promptApiKey({ input = process.stdin, output = process.stdout } = {}) {
  output.write('\n  Get your API key (opens browser, creates key automatically):\n');
  output.write('  \x1b[36mhttps://tomsindex.com/quick-key\x1b[0m\n\n');
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question('  Paste your API key: ');
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function promptAskMode({ input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question('Auto-generate answers on cache miss? (recommended, uses 1 search credit per miss) [Y/n] (default: Yes): ');
    const trimmed = answer.trim().toLowerCase();
    return (trimmed === '' || trimmed === 'y' || trimmed === 'yes') ? 'generate' : 'lookup';
  } finally {
    rl.close();
  }
}

async function resolveAskMode(args, io) {
  if (args['ask-mode']) {
    const mode = args['ask-mode'];
    if (mode !== 'lookup' && mode !== 'generate') throw new Error('--ask-mode must be "lookup" or "generate".');
    return mode;
  }
  if (args['public-only']) return 'lookup';
  return promptAskMode(io);
}

async function resolveApiKey(args, io) {
  if (args['public-only']) return '';
  const apiKey = args['api-key'] || process.env.TOMSINDEX_API_KEY || await promptApiKey(io);
  if (!apiKey) throw new Error('Missing API key. Get one at https://tomsindex.com/quick-key and run install again.');
  if (!apiKey.startsWith('srch_')) throw new Error('That does not look like a Tom\'s Index API key. Expected a key starting with srch_.');
  return apiKey;
}

async function install(argv, io) {
  const args = parseArgs(argv);
  const options = {
    home: args.home,
    dryRun: Boolean(args['dry-run']),
    url: args.url || process.env.TOMSINDEX_URL || 'https://tomsindex.com',
    apiKey: await resolveApiKey(args, io),
    publicOnly: Boolean(args['public-only']),
    askMode: await resolveAskMode(args, io),
  };
  const out = [];
  for (const client of clients(args.client)) {
    if (client === 'claude') {
      const res = installClaudeHook(options);
      out.push(`${options.dryRun ? 'Would update' : 'Updated'} ${res.filePath}`);
      const mdRes = installClaudeMd(options);
      out.push(`${options.dryRun ? 'Would update' : 'Updated'} ${mdRes.filePath}`);
      const mcpArgs = ['mcp', 'add', '--scope', 'user', 'tomsindex', '--env', `TOMSINDEX_URL=${options.url}`, '--env', `TOMSINDEX_ASK_MODE=${options.askMode}`];
      if (!options.publicOnly && options.apiKey) mcpArgs.push('--env', `TOMSINDEX_API_KEY=${options.apiKey}`);
      mcpArgs.push('--', process.execPath, binPath(), 'mcp');
      if (options.dryRun) {
        out.push(`Would run: claude ${mcpArgs.join(' ')}`);
      } else {
        spawnSync('claude', ['mcp', 'remove', 'tomsindex', '--scope', 'user'], { stdio: 'pipe', encoding: 'utf8' });
        const added = spawnSync('claude', mcpArgs, { stdio: 'pipe', encoding: 'utf8' });
        if (added.status === 0) out.push('Updated Claude MCP server: tomsindex');
        else {
          const detail = (added.stderr || added.stdout || '').trim();
          out.push(`warn Claude MCP add failed${detail ? `: ${detail}` : ''}; run manually: claude ${mcpArgs.join(' ')}`);
        }
      }
    } else if (client === 'codex') {
      const res = installCodex(options);
      out.push(`${options.dryRun ? 'Would update' : 'Updated'} ${res.filePath}`);
    } else if (client === 'cursor') {
      const res = installCursor(options);
      out.push(`${options.dryRun ? 'Would update' : 'Updated'} ${res.filePath}`);
    }
  }
  return out.join('\n');
}

function uninstall(argv) {
  const args = parseArgs(argv);
  const options = { home: args.home, dryRun: Boolean(args['dry-run']) };
  const out = [];
  for (const client of clients(args.client)) {
    if (client === 'claude') {
      const res = uninstallClaudeHook(options);
      out.push(`${options.dryRun ? 'Would update' : 'Updated'} ${res.filePath}`);
      const mdRes = uninstallClaudeMd(options);
      out.push(`${options.dryRun ? 'Would update' : 'Updated'} ${mdRes.filePath}`);
      if (options.dryRun) {
        out.push('Would run: claude mcp remove tomsindex');
      } else {
        const removed = spawnSync('claude', ['mcp', 'remove', 'tomsindex'], { stdio: 'pipe', encoding: 'utf8' });
        if (removed.status === 0) out.push('Removed Claude MCP server: tomsindex');
        else out.push('warn Claude MCP remove failed; run manually: claude mcp remove tomsindex');
      }
    } else if (client === 'codex') {
      const res = uninstallCodex(options);
      out.push(`${options.dryRun ? 'Would update' : 'Updated'} ${res.filePath}`);
    } else if (client === 'cursor') {
      const res = uninstallCursor(options);
      out.push(`${options.dryRun ? 'Would update' : 'Updated'} ${res.filePath}`);
    }
  }
  return out.join('\n');
}

function doctor(argv) {
  const args = parseArgs(argv);
  const home = args.home;
  const rows = [];
  rows.push({ name: 'node >=18.17', ok: process.versions.node.split('.').map(Number)[0] >= 18 });
  rows.push({ name: 'Claude settings', ok: fs.existsSync(claudeSettingsPath({ home })) });
  rows.push({ name: 'Codex config', ok: fs.existsSync(codexConfigPath({ home })) });
  rows.push({ name: 'Cursor config', ok: fs.existsSync(cursorConfigPath({ home })) });
  rows.push({ name: 'API key env', ok: Boolean(process.env.TOMSINDEX_API_KEY) });
  rows.push({ name: 'CLI starts', ok: spawnSync(process.execPath, [require.main?.filename || process.argv[1], '--help'], { timeout: 1000 }).status === 0 });
  return rows.map((row) => `${row.ok ? 'ok' : 'warn'} ${row.name}`).join('\n');
}

async function checkForUpdate() {
  try {
    const pkg = require('../package.json');
    const res = await fetch('https://registry.npmjs.org/tomsindex/latest', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.version && data.version !== pkg.version) {
      console.log(`\n  Update available: ${pkg.version} → ${data.version}`);
      console.log(`  Run: npx tomsindex@latest\n`);
    }
  } catch {}
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === '--help' || command === '-h') {
    console.log(help());
    return;
  }
  if (!command) {
    await checkForUpdate();
    console.log(await install([]));
    return;
  }
  if (command === 'noop') return;
  if (command === 'install') {
    console.log(await install(rest));
    return;
  }
  if (command === 'uninstall') {
    console.log(uninstall(rest));
    return;
  }
  if (command === 'doctor') {
    console.log(doctor(rest));
    return;
  }
  if (command === 'mcp') {
    runMcp();
    return;
  }
  if (command === 'hook') {
    const client = rest[0];
    if (client !== 'claude' && client !== 'codex') throw new Error('Usage: tomsindex hook claude|codex');
    await runHook(client);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${help()}`);
}

module.exports = { parseArgs, promptApiKey, promptAskMode, resolveApiKey, resolveAskMode, install, uninstall, doctor, main };
