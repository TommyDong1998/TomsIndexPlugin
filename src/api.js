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

async function ask({ baseUrl, apiKey, q, caller_model, min_model_tier, min_similarity, alternatives }) {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/v1/answer`);
  url.searchParams.set('q', q);
  if (caller_model) url.searchParams.set('caller_model', caller_model);
  if (min_model_tier !== undefined) url.searchParams.set('min_model_tier', String(min_model_tier));
  if (min_similarity !== undefined) url.searchParams.set('min_similarity', String(min_similarity));
  if (alternatives !== undefined) url.searchParams.set('alternatives', String(Boolean(alternatives)));

  const res = await fetch(url, { headers: apiHeaders(apiKey) });
  if (!res.ok) throw new Error(`TomsIndex answer error: ${await readError(res)}`);
  return res.json();
}

async function hints({ baseUrl, apiKey, task, stack_hint }) {
  const body = { task };
  if (stack_hint) body.stack_hint = stack_hint;
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/v1/hints`, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TomsIndex hints error: ${await readError(res)}`);
  return res.json();
}

async function hintsFeedback({ baseUrl, apiKey, hint_id, succeeded, stderr }) {
  const body = { hint_id, succeeded };
  if (stderr) body.stderr = stderr;
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/v1/hints/feedback`, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TomsIndex hints feedback error: ${await readError(res)}`);
  return res.json();
}

module.exports = { normalizeBaseUrl, search, ask, hints, hintsFeedback };
