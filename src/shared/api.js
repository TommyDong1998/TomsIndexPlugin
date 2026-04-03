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

async function ask({ baseUrl, apiKey, q, caller_model, min_model_tier, min_similarity, alternatives, mode }) {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/v1/answer`);
  url.searchParams.set('q', q);
  if (mode) url.searchParams.set('mode', mode);
  if (caller_model) url.searchParams.set('caller_model', caller_model);
  if (min_model_tier !== undefined) url.searchParams.set('min_model_tier', String(min_model_tier));
  if (min_similarity !== undefined) url.searchParams.set('min_similarity', String(min_similarity));
  if (alternatives !== undefined) url.searchParams.set('alternatives', String(Boolean(alternatives)));

  const res = await fetch(url, { headers: apiHeaders(apiKey) });
  if (!res.ok) throw new Error(`TomsIndex answer error: ${await readError(res)}`);
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

module.exports = { normalizeBaseUrl, search, ask, extract, hint };
