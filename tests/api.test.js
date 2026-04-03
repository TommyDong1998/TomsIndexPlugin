'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { search } = require('../src/shared/api');

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
