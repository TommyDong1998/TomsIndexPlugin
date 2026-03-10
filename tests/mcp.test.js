'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

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

test('MCP initialize and tools/list include canonical and alias tools', async () => {
  const client = createClient();
  try {
    client.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    const init = await client.wait();
    assert.equal(init.result.serverInfo.name, 'tomsindex');

    client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const list = await client.wait();
    const names = list.result.tools.map((tool) => tool.name);
    assert.ok(names.includes('tomsindex_search'));
    assert.ok(names.includes('web_search'));
    assert.ok(names.includes('tomsindex_ask'));
    assert.ok(names.includes('tomsindex_hints'));
  } finally {
    client.close();
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
