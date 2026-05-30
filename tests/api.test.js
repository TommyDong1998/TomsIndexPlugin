'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { search, solutions, submitSolution } = require('../src/shared/api');

test('search calls /v1/tools/web_search', async () => {
  const originalFetch = global.fetch;
  let seenUrl = '';
  global.fetch = async (url) => {
    seenUrl = String(url);
    return {
      ok: true,
      json: async () => ({ results: [] }),
    };
  };
  try {
    await search({ baseUrl: 'http://127.0.0.1:1234', apiKey: 'srch_test', query: 'hello' });
    assert.equal(new URL(seenUrl).pathname, '/v1/tools/web_search');
  } finally {
    global.fetch = originalFetch;
  }
});

test('solutions calls /v1/solutions with solution lookup parameters', async () => {
  const originalFetch = global.fetch;
  let seenUrl = '';
  global.fetch = async (url) => {
    seenUrl = String(url);
    return {
      ok: true,
      json: async () => ({ solutions: [] }),
    };
  };
  try {
    await solutions({
      baseUrl: 'http://127.0.0.1:1234',
      apiKey: 'srch_test',
      q: 'fix next auth callback',
      alternatives: true,
      tags: ['nextjs', 'auth'],
      source: 'community',
    });
    const url = new URL(seenUrl);
    assert.equal(url.pathname, '/v1/solutions');
    assert.equal(url.searchParams.get('q'), 'fix next auth callback');
    assert.equal(url.searchParams.get('limit'), '3');
    assert.equal(url.searchParams.get('sort'), 'hits');
    assert.equal(url.searchParams.get('tags'), 'nextjs,auth');
    assert.equal(url.searchParams.get('source'), 'community');
    assert.equal(url.searchParams.get('mode'), null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('submitSolution posts to /v1/solutions', async () => {
  const originalFetch = global.fetch;
  let seenUrl = '';
  let seenBody = null;
  global.fetch = async (url, init) => {
    seenUrl = String(url);
    seenBody = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({ id: 'sol_123' }),
    };
  };
  try {
    await submitSolution({
      baseUrl: 'http://127.0.0.1:1234',
      apiKey: 'srch_test',
      question: 'Add cursor pagination',
      solution: 'Use a stable order by id and pass the cursor id to the next request.',
      tags: ['api'],
    });
    assert.equal(new URL(seenUrl).pathname, '/v1/solutions');
    assert.deepEqual(seenBody, {
      question: 'Add cursor pagination',
      solution: 'Use a stable order by id and pass the cursor id to the next request.',
      tags: ['api'],
    });
  } finally {
    global.fetch = originalFetch;
  }
});
