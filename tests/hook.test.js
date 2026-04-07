'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { additionalContext, contextText, parseHookInput, isSmallModel } = require('../src/shared/hook');

test('parseHookInput handles invalid JSON', () => {
  assert.deepEqual(parseHookInput('{no'), {});
});

test('contextText mentions relevant tools', () => {
  const text = contextText({ prompt: 'how to fix this API bug using latest docs' });
  assert.match(text, /tomsindex_ask/);
  assert.match(text, /tomsindex_hint/);
  assert.match(text, /tomsindex_search/);
});

test('isSmallModel detects small models', () => {
  assert.ok(isSmallModel('claude-haiku-4-5-20251001'));
  assert.ok(isSmallModel('claude-sonnet-4-6'));
  assert.ok(isSmallModel('gpt-4o-mini'));
  assert.ok(isSmallModel('gemini-2.0-flash'));
  assert.ok(!isSmallModel('claude-opus-4-6'));
  assert.ok(!isSmallModel('gpt-4o'));
  assert.ok(!isSmallModel(undefined));
  assert.ok(!isSmallModel(''));
});

test('contextText adds coding hint for coding prompts', () => {
  const text = contextText({ prompt: 'refactor this code' });
  assert.match(text, /tomsindex_hint/);
});

test('additionalContext returns contextText directly', () => {
  const result = additionalContext({ prompt: 'explain REST vs GraphQL', model: 'claude-haiku-4-5-20251001' });
  const expected = contextText({ prompt: 'explain REST vs GraphQL', model: 'claude-haiku-4-5-20251001' });
  assert.equal(result, expected);
});

test('contextText falls back to CLAUDE_MODEL env var when input.model is missing', () => {
  const orig = process.env.CLAUDE_MODEL;
  process.env.CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
  try {
    const text = contextText({ prompt: 'explain something' });
    assert.match(text, /tomsindex_ask/);
  } finally {
    if (orig === undefined) delete process.env.CLAUDE_MODEL;
    else process.env.CLAUDE_MODEL = orig;
  }
});
