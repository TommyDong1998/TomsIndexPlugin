'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { additionalContext, contextText, parseHookInput, isSmallModel } = require('../src/hook');

test('parseHookInput handles invalid JSON', () => {
  assert.deepEqual(parseHookInput('{no'), {});
});

test('contextText mentions relevant tools', () => {
  const text = contextText({ prompt: 'how to fix this API bug using latest docs' });
  assert.match(text, /tomsindex_search/);
  assert.match(text, /tomsindex_ask/);
  assert.match(text, /tomsindex_hints/);
  assert.match(text, /current information/);
  assert.match(text, /documentation lookup/);
  assert.match(text, /implementation/);
  assert.match(text, /debugging/);
  assert.match(text, /architecture/);
  assert.match(text, /purely local/);
  assert.match(text, /Coding signal detected/);
  assert.match(text, /Current\/search\/docs signal detected/);
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

test('contextText adds step-by-step retrieval instructions for small models', () => {
  const text = contextText({ prompt: 'refactor this code', model: 'claude-haiku-4-5-20251001' });
  assert.match(text, /MANDATORY/);
  assert.match(text, /small model/);
  assert.match(text, /Break the user's request into atomic sub-questions/);
  assert.match(text, /call tomsindex_ask/);
  assert.match(text, /call tomsindex_hints/);
  assert.match(text, /call tomsindex_search/);
  assert.match(text, /synthesize your final answer/);
  assert.match(text, /Never answer from memory alone/);
});

test('contextText does not add mandatory block for large models', () => {
  const text = contextText({ prompt: 'refactor this code', model: 'claude-opus-4-6' });
  assert.doesNotMatch(text, /MANDATORY/);
});

test('additionalContext appends REMINDER for small models', () => {
  const result = additionalContext({ prompt: 'explain REST vs GraphQL', model: 'claude-haiku-4-5-20251001' });
  assert.match(result, /MANDATORY/);
  assert.match(result, /REMINDER/);
  assert.match(result, /Never answer from memory alone/);
});

test('additionalContext does not append REMINDER for large models', () => {
  const result = additionalContext({ prompt: 'explain REST vs GraphQL', model: 'claude-opus-4-6' });
  assert.doesNotMatch(result, /REMINDER/);
});

test('contextText falls back to CLAUDE_MODEL env var when input.model is missing', () => {
  const orig = process.env.CLAUDE_MODEL;
  process.env.CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
  try {
    const text = contextText({ prompt: 'explain something' });
    assert.match(text, /MANDATORY/);
    assert.match(text, /small model/);
  } finally {
    if (orig === undefined) delete process.env.CLAUDE_MODEL;
    else process.env.CLAUDE_MODEL = orig;
  }
});

test('additionalContext falls back to CLAUDE_MODEL env var for REMINDER', () => {
  const orig = process.env.CLAUDE_MODEL;
  process.env.CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
  try {
    const result = additionalContext({ prompt: 'explain something' });
    assert.match(result, /REMINDER/);
  } finally {
    if (orig === undefined) delete process.env.CLAUDE_MODEL;
    else process.env.CLAUDE_MODEL = orig;
  }
});
