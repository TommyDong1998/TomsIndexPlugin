'use strict';

const { normalizeBaseUrl, search, ask, hints, hintsFeedback } = require('./api');

const BASE_URL = normalizeBaseUrl(process.env.TOMSINDEX_URL);
const API_KEY = process.env.TOMSINDEX_API_KEY || '';
const DEFAULT_ASK_MODE = process.env.TOMSINDEX_ASK_MODE || 'generate';

const TOOLS = [
  {
    name: 'tomsindex_search',
    description: 'Search the web using Tom\'s Index. Returns titles, URLs, snippets, and result IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', description: 'Max results, default 5, maximum 20.' },
        feedback: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              result_id: { type: 'string' },
              vote: { type: 'number', enum: [1, -1] },
            },
            required: ['result_id', 'vote'],
          },
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'tomsindex_ask',
    description: 'Look up a cached or generated answer from Tom\'s Index answer cache.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Question to answer.' },
        mode: { type: 'string', enum: ['lookup', 'generate'], description: 'lookup: cache-only, returns null on miss. generate: on cache miss, runs a web search, summarizes the top results, caches the answer, and returns it. Costs 1 search credit.' },
        caller_model: { type: 'string' },
        min_model_tier: { type: 'number' },
        min_similarity: { type: 'number' },
        alternatives: { type: 'boolean' },
      },
      required: ['q'],
    },
  },
  {
    name: 'tomsindex_hints',
    description: 'Get structured coding-task hints from Tom\'s Index.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string' },
        stack_hint: { type: 'string' },
      },
      required: ['task'],
    },
  },
  {
    name: 'tomsindex_hints_feedback',
    description: 'Report whether a prior Tom\'s Index hints response worked.',
    inputSchema: {
      type: 'object',
      properties: {
        hint_id: { type: 'number' },
        succeeded: { type: 'boolean' },
        stderr: { type: 'string' },
      },
      required: ['hint_id', 'succeeded'],
    },
  },
];

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function result(id, content, isError = false) {
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: content }], ...(isError ? { isError: true } : {}) } };
}

function textFromSearch(data) {
  return (data.results || [])
    .map((r, i) => `${i + 1}. [${r.result_id || ''}] ${r.title || ''}\n   ${r.url || ''}\n   ${r.snippet || ''}`.trimEnd())
    .join('\n\n') || 'No results found.';
}

function textFromAnswer(data) {
  if (data.answer?.text) return data.answer.text;
  if (data.text) return data.text;
  if (data.cache_hit === false || data.answer === null) {
    return `No cached Tom's Index answer found for "${data.query || 'this question'}". Use tomsindex_search next for web/source context, or tomsindex_hints if this is a coding/build task. Raw response:\n${JSON.stringify(data, null, 2)}`;
  }
  return JSON.stringify(data, null, 2);
}

async function callTool(name, args) {
  logMcpCall(name, args);
  if (name === 'tomsindex_search') {
    return textFromSearch(await search({ baseUrl: BASE_URL, apiKey: API_KEY, ...args }));
  }
  if (name === 'tomsindex_ask') {
    const askArgs = { mode: DEFAULT_ASK_MODE, ...args };
    return textFromAnswer(await ask({ baseUrl: BASE_URL, apiKey: API_KEY, ...askArgs }));
  }
  if (name === 'tomsindex_hints') {
    return JSON.stringify(await hints({ baseUrl: BASE_URL, apiKey: API_KEY, ...args }), null, 2);
  }
  if (name === 'tomsindex_hints_feedback') {
    return JSON.stringify(await hintsFeedback({ baseUrl: BASE_URL, apiKey: API_KEY, ...args }), null, 2);
  }
  throw new Error(`Unknown tool: ${name}`);
}

function logMcpCall(name, args) {
  const filePath = process.env.TOMSINDEX_MCP_LOG;
  if (!filePath) return;
  const line = JSON.stringify({
    at: new Date().toISOString(),
    tool: name,
    args,
  });
  require('fs').appendFileSync(filePath, `${line}\n`);
}

async function handleMessage(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'tomsindex', version: '0.1.0' },
      },
    });
    return;
  }

  if (method === 'notifications/initialized') return;

  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }

  if (method === 'tools/call') {
    try {
      send(result(id, await callTool(params?.name, params?.arguments || {})));
    } catch (error) {
      send(result(id, error.message, true));
    }
    return;
  }

  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
}

function runMcp() {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) handleMessage(line);
    }
  });
  process.stderr.write(`[tomsindex-mcp] Ready base=${BASE_URL} key=${API_KEY ? 'set' : 'none'}\n`);
}

module.exports = { TOOLS, callTool, handleMessage, logMcpCall, runMcp };
