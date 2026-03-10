'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { contextText, parseHookInput } = require('../src/hook');

test('parseHookInput handles invalid JSON', () => {
  assert.deepEqual(parseHookInput('{no'), {});
});

test('contextText mentions relevant tools', () => {
  const text = contextText({ prompt: 'fix this API bug using latest docs' });
  assert.match(text, /tomsindex_search/);
  assert.match(text, /current information/);
  assert.match(text, /documentation lookup/);
  assert.match(text, /citations/);
  assert.match(text, /tomsindex_ask/);
  assert.match(text, /direct factual or explanatory question/);
  assert.match(text, /tomsindex_hints/);
  assert.match(text, /implementation/);
  assert.match(text, /debugging/);
  assert.match(text, /architecture/);
  assert.match(text, /smaller or cheaper model/);
  assert.match(text, /higher-quality cached answers/);
  assert.match(text, /purely local file inspection/);
  assert.match(text, /coding-related/);
  assert.match(text, /current external context/);
});
