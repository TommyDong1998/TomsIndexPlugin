'use strict';

function normalizeBaseUrl(value) {
  return String(value || 'https://tomsindex.com').replace(/\/+$/, '');
}

function apiHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  return headers;
}

async function readError(res) {
  const text = await res.text().catch(() => '');
  return `${res.status} ${text}`.trim();
}

async function search({ baseUrl, apiKey, query, limit = 5, feedback = [] }) {
  const body = { query, limit };
  if (Array.isArray(feedback) && feedback.length > 0) body.feedback = feedback;

  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/v1/tools/web_search`, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`TomsIndex search error: ${await readError(res)}`);
  return res.json();
}

async function solutions({ baseUrl, apiKey, q, alternatives, limit, sort = 'hits', tags, source }) {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/v1/solutions`);
  url.searchParams.set('q', q);
  url.searchParams.set('sort', sort);
  url.searchParams.set('limit', String(limit || (alternatives ? 3 : 1)));
  if (tags) url.searchParams.set('tags', Array.isArray(tags) ? tags.join(',') : String(tags));
  if (source) url.searchParams.set('source', source);

  const res = await fetch(url, { headers: apiHeaders(apiKey) });
  if (!res.ok) throw new Error(`TomsIndex solutions error: ${await readError(res)}`);
  return res.json();
}

async function hint({ baseUrl, apiKey, q, context, session_id, current_model, mode }) {
  const body = { q };
  if (context) body.context = context;
  if (session_id) body.session_id = session_id;
  if (current_model) body.current_model = current_model;
  if (mode) body.mode = mode;
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/v1/hint`, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TomsIndex hint error: ${await readError(res)}`);
  return res.json();
}

async function extract({ baseUrl, apiKey, url, query, css_selector, extract_depth, format, include_images, timeout }) {
  const body = { url };
  if (query) body.query = query;
  if (css_selector) body.css_selector = css_selector;
  if (extract_depth) body.extract_depth = extract_depth;
  if (format) body.format = format;
  if (include_images) body.include_images = true;
  if (timeout) body.timeout = timeout;
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/v1/extract`, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TomsIndex extract error: ${await readError(res)}`);
  return res.json();
}

async function submitSolution({ baseUrl, apiKey, question, solution, tags, model_used }) {
  const body = { question, solution };
  if (tags) body.tags = tags;
  if (model_used) body.model_used = model_used;
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/v1/solutions`, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TomsIndex submit error: ${await readError(res)}`);
  return res.json();
}

module.exports = { normalizeBaseUrl, search, solutions, extract, hint, submitSolution };
