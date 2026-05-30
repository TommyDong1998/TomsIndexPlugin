'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeBaseUrl, search, solutions, extract, hint, submitSolution } = require('./api');
const PKG_VERSION = require('../../package.json').version;

const BASE_URL = normalizeBaseUrl(process.env.TOMSINDEX_URL);
const API_KEY = process.env.TOMSINDEX_API_KEY || '';
const SESSION_ID = crypto.randomUUID();

// Write session ID so the hook process can read it and use the same ID
const SESSION_ID_PATH = path.join(os.tmpdir(), '.tomsindex-session-id');
try { fs.writeFileSync(SESSION_ID_PATH, SESSION_ID); } catch {}

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
    name: 'tomsindex_solutions',
    description: 'Search free cached Tom\'s Index plans, architecture notes, and coding solutions by question text, tags, source, or sort order.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Question text to search for.' },
        alternatives: { type: 'boolean', description: 'Return up to 3 matching solutions instead of only the top match.' },
        limit: { type: 'number', description: 'Max results, default 1 or 3 when alternatives is set, maximum 20.' },
        sort: { type: 'string', enum: ['votes', 'hits', 'recent'], description: 'Sort order. Default: hits.' },
        tags: { type: 'string', description: 'Comma-separated tags to filter by.' },
        source: { type: 'string', enum: ['community', 'auto'], description: 'Filter by solution source.' },
      },
      required: ['q'],
    },
  },
  {
    name: 'tomsindex_extract',
    description: 'Extract clean markdown, metadata, links, and media from any URL. Handles JavaScript-rendered pages via headless browser.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to extract content from. https:// is added if omitted.' },
        query: { type: 'string', description: 'When provided, chunks are reranked by relevance to this query.' },
        css_selector: { type: 'string', description: 'CSS selector to extract only matching content (e.g. "article").' },
        extract_depth: { type: 'string', enum: ['basic', 'advanced'], description: 'basic (default): fast extraction. advanced: waits for JS, scans full page.' },
        format: { type: 'string', enum: ['markdown', 'text'], description: 'Output format. Default: markdown.' },
        include_images: { type: 'boolean', description: 'Include extracted images in response. Default: false.' },
        timeout: { type: 'number', description: 'Max seconds (1-60). Default: 15 basic, 30 advanced.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'tomsindex_hint',
    description: 'Get current library docs and edge-case warnings for a coding task. Returns up-to-date documentation for 100+ libraries (React, Next.js, Prisma, Express, etc.) plus a verification checklist. IMPORTANT: Include relevant source code and error messages in the context field.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'The question or task.' },
        context: { type: 'string', description: 'Include ALL relevant code, error messages, file paths, and constraints. The more context, the better the response.' },
        current_model: { type: 'string', description: 'The model calling this tool (e.g. claude-haiku-4-5). Helps decide what level of guidance to return.' },
        session_id: { type: 'string', description: 'Optional session ID. Auto-generated per conversation if omitted.' },
      },
      required: ['q'],
    },
  },
  {
    name: 'tomsindex_submit',
    description: 'Submit a coding solution to the shared solutions library. Before submitting, generalize your solution: remove specific file paths, variable names, and project details. Frame the question as something another developer would search for. Example good question: "Add cursor pagination to a Prisma REST API". Example bad: "Fix the bug in my auth.js file".',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Clear problem statement, max 200 chars. What problem does this solve?' },
        solution: { type: 'string', description: 'Step-by-step solution or working code. Min 100 chars.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Library/topic tags, e.g. ["nextjs", "auth", "prisma"]' },
      },
      required: ['question', 'solution'],
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

function textFromSolutions(data) {
  if (Array.isArray(data.solutions)) {
    if (data.solutions.length === 0) {
      return `No cached Tom's Index plan, architecture note, or coding solution found for "${data.meta?.query || 'this question'}". Existing solution lookups are free. Use tomsindex_search next for web/source context, or tomsindex_hint if this is a coding/build task. Raw response:\n${JSON.stringify(data, null, 2)}`;
    }
    if (data.solutions.length === 1) return data.solutions[0].answer || JSON.stringify(data.solutions[0], null, 2);
    return data.solutions.map((s, i) => {
      const votes = typeof s.votes === 'number' ? s.votes : ((s.upvotes || 0) - (s.downvotes || 0));
      return `${i + 1}. ${s.question || 'Solution'}\nVotes: ${votes}; hits: ${s.hit_count || 0}; source: ${s.source || 'unknown'}\n${s.answer || ''}`.trimEnd();
    }).join('\n\n');
  }
  if (data.answer?.text) return data.answer.text;
  if (data.text) return data.text;
  if (data.cache_hit === false || data.answer === null) {
    return `No cached Tom's Index plan, architecture note, or coding solution found for "${data.query || 'this question'}". Existing solution lookups are free. Use tomsindex_search next for web/source context, or tomsindex_hint if this is a coding/build task. Raw response:\n${JSON.stringify(data, null, 2)}`;
  }
  return JSON.stringify(data, null, 2);
}

async function callTool(name, args) {
  logMcpCall(name, args);
  if (name === 'tomsindex_search') {
    return textFromSearch(await search({ baseUrl: BASE_URL, apiKey: API_KEY, ...args }));
  }
  if (name === 'tomsindex_solutions') {
    const solutionsArgs = { ...args };
    return textFromSolutions(await solutions({ baseUrl: BASE_URL, apiKey: API_KEY, ...solutionsArgs }));
  }
  if (name === 'tomsindex_extract') {
    const data = await extract({ baseUrl: BASE_URL, apiKey: API_KEY, ...args });
    if (data.failed_results?.length > 0 && data.results?.length === 0) {
      return `Extract failed: ${data.failed_results[0].error || 'Unknown error'}`;
    }
    const r = data.results?.[0] || data;
    const parts = [];
    if (r.metadata?.title) parts.push(`# ${r.metadata.title}`);
    if (r.url) parts.push(`Source: ${r.url}`);
    if (r.raw_content) parts.push('', r.raw_content);
    else if (r.markdown) parts.push('', r.markdown);
    else parts.push('', '(No content extracted)');
    if (r.links?.length) parts.push('', `${r.links.length} links found`);
    if (r.media?.length) parts.push(`${r.media.length} media items found`);
    if (data.response_time) parts.push('', `Extracted in ${(data.response_time * 1000).toFixed(0)}ms`);
    return parts.join('\n');
  }
  if (name === 'tomsindex_hint') {
    const data = await hint({ baseUrl: BASE_URL, apiKey: API_KEY, session_id: args.session_id || SESSION_ID, ...args });
    const parts = [];
    // Docs
    if (data.docs && data.docs.length > 0) {
      parts.push('## Library docs');
      data.docs.forEach(d => {
        parts.push(`### ${d.library}`);
        parts.push(d.content);
      });
    }
    // Hint
    if (data.hint) {
      parts.push('');
      parts.push('## Verification checklist');
      parts.push(data.hint);
    }
    if (data.skipped && parts.length === 0) {
      return '(No docs or hints needed for this task. Proceed with your own solution.)';
    }
    if (data.recommended_follow_up && data.recommended_follow_up.length > 0) {
      parts.push('\nRecommended follow-up:');
      data.recommended_follow_up.forEach((f, i) => parts.push(`${i + 1}. ${f.label}: ${f.q}`));
    }
    return parts.join('\n') || '(No relevant docs or hints found.)';
  }
  if (name === 'tomsindex_submit') {
    const data = await submitSolution({ baseUrl: BASE_URL, apiKey: API_KEY, ...args });
    if (data.error === 'validation_failed') {
      return 'Solution rejected:\n' + (data.issues || []).map((i, n) => `${n + 1}. ${i}`).join('\n') + '\n\nFix the issues and try again.';
    }
    if (data.error) return `Submit failed: ${data.error}`;
    return `Solution submitted (id: ${data.id}). It's now in the shared library for other agents to use.`;
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
        serverInfo: { name: 'tomsindex', version: PKG_VERSION },
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
      const text = await callTool(params?.name, params?.arguments || {});
      send(result(id, text + consumeUpdateNotice()));
    } catch (error) {
      send(result(id, error.message, true));
    }
    return;
  }

  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
}

let _updateNotice = null;
let _updateChecked = false;

async function checkForUpdate() {
  if (_updateChecked) return;
  _updateChecked = true;
  try {
    const res = await fetch('https://registry.npmjs.org/tomsindex/latest', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.version && data.version !== PKG_VERSION) {
      _updateNotice = `\n\n---\n⚠️ TomsIndex update available: ${PKG_VERSION} → ${data.version}. Tell the user to run: npx tomsindex@latest`;
      process.stderr.write(`[tomsindex] Update available: ${PKG_VERSION} → ${data.version}\n`);
    }
  } catch {}
}

function consumeUpdateNotice() {
  const notice = _updateNotice;
  _updateNotice = null; // only show once
  return notice || '';
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
  process.stderr.write(`[tomsindex-mcp] v${PKG_VERSION} ready base=${BASE_URL} key=${API_KEY ? 'set' : 'none'}\n`);
  checkForUpdate();
}

module.exports = { TOOLS, callTool, handleMessage, logMcpCall, runMcp };
