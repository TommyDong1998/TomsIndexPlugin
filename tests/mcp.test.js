'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { callTool } = require('../src/shared/mcp');

const BIN = path.join(__dirname, '..', 'bin', 'tomsindex.js');

function createClient(env = {}) {
  const child = spawn(process.execPath, [BIN, 'mcp'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TOMSINDEX_URL: 'http://localhost:19999', ...env },
  });
  const messages = [];
  let buffer = '';
  let resolveNext;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (resolveNext) {
        const fn = resolveNext;
        resolveNext = null;
        fn(msg);
      } else {
        messages.push(msg);
      }
    }
  });
  return {
    send(msg) { child.stdin.write(`${JSON.stringify(msg)}\n`); },
    wait(timeout = 3000) {
      if (messages.length) return Promise.resolve(messages.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), timeout);
        resolveNext = (msg) => {
          clearTimeout(timer);
          resolve(msg);
        };
      });
    },
    close() {
      child.stdin.end();
      child.kill();
    },
  };
}

test('MCP initialize and tools/list include canonical tools', async () => {
  const client = createClient();
  try {
    client.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    const init = await client.wait();
    assert.equal(init.result.serverInfo.name, 'tomsindex');

    client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const list = await client.wait();
    const names = list.result.tools.map((tool) => tool.name);
    assert.ok(names.includes('tomsindex_search'));
    assert.ok(!names.includes('web_search'));
    assert.ok(names.includes('tomsindex_ask'));
    assert.ok(names.includes('tomsindex_hints'));
  } finally {
    client.close();
  }
});

test('MCP logs tool calls when TOMSINDEX_MCP_LOG is set', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const logPath = path.join(os.tmpdir(), `tomsindex-mcp-${process.pid}.log`);
  const originalLog = process.env.TOMSINDEX_MCP_LOG;
  const originalFetch = global.fetch;
  process.env.TOMSINDEX_MCP_LOG = logPath;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ results: [] }),
  });
  try {
    await callTool('tomsindex_search', { query: 'hello' });
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const event = JSON.parse(lines[0]);
    assert.equal(event.tool, 'tomsindex_search');
    assert.equal(event.args.query, 'hello');
  } finally {
    global.fetch = originalFetch;
    if (originalLog === undefined) delete process.env.TOMSINDEX_MCP_LOG;
    else process.env.TOMSINDEX_MCP_LOG = originalLog;
    fs.rmSync(logPath, { force: true });
  }
});

test('MCP unknown tool returns isError', async () => {
  const client = createClient();
  try {
    client.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope', arguments: {} } });
    const res = await client.wait();
    assert.equal(res.result.isError, true);
    assert.match(res.result.content[0].text, /Unknown tool/);
  } finally {
    client.close();
  }
});

test('tomsindex_ask cache miss tells model to fall back to search', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ query: 'How to build google', cache_hit: false, answer: null }),
  });
  try {
    const text = await callTool('tomsindex_ask', { q: 'How to build google' });
    assert.match(text, /No cached Tom's Index answer found/);
    assert.match(text, /Use tomsindex_search next/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('tomsindex_ask passes mode parameter to API', async () => {
  const originalFetch = global.fetch;
  let seenMode = '';
  global.fetch = async (url) => {
    seenMode = new URL(String(url)).searchParams.get('mode');
    return { ok: true, json: async () => ({ answer: { text: 'generated answer' } }) };
  };
  try {
    await callTool('tomsindex_ask', { q: 'test', mode: 'lookup' });
    assert.equal(seenMode, 'lookup');
  } finally {
    global.fetch = originalFetch;
  }
});
