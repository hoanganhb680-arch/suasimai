'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWorkflowArguments, NORMALIZE_FN_SOURCE } = require('./normalize-workflow-arguments.cjs');

// Schema shape produced by tools/params.ts applyDynamicSchemaForWorkflow
const quoteSchema = {
  type: 'object',
  properties: {
    inputMapping: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        scope: { type: 'string' },
        booking: { type: 'string' },
        basis: { type: 'string' },
        ordinal: { type: 'number' },
      },
      required: ['owner', 'scope', 'booking', 'basis', 'ordinal'],
    },
  },
  required: ['inputMapping'],
};

test('lifts flat model args into inputMapping', () => {
  const out = normalizeWorkflowArguments(
    { booking: 'BK-123', basis: 'FIRST_DISTINCT_BOOKING_MENTION', ordinal: 1 },
    quoteSchema,
  );
  assert.deepEqual(out, {
    inputMapping: {
      booking: 'BK-123',
      basis: 'FIRST_DISTINCT_BOOKING_MENTION',
      ordinal: 1,
    },
  });
});

test('keeps already-nested inputMapping', () => {
  const out = normalizeWorkflowArguments(
    { inputMapping: { booking: 'BK-123', owner: 'user1' } },
    quoteSchema,
  );
  assert.deepEqual(out, { inputMapping: { booking: 'BK-123', owner: 'user1' } });
});

test('merges nested + flat when no conflict', () => {
  const out = normalizeWorkflowArguments(
    { inputMapping: { booking: 'BK-123' }, basis: 'LATEST_BOOKING_MENTION', ordinal: 2 },
    quoteSchema,
  );
  assert.deepEqual(out, {
    inputMapping: { booking: 'BK-123', basis: 'LATEST_BOOKING_MENTION', ordinal: 2 },
  });
});

test('flat wins over missing nested (nested absent)', () => {
  const out = normalizeWorkflowArguments({ booking: 'BK-456' }, quoteSchema);
  assert.deepEqual(out, { inputMapping: { booking: 'BK-456' } });
});

test('throws on conflicting nested vs flat value', () => {
  assert.throws(
    () => normalizeWorkflowArguments({ inputMapping: { booking: 'BK-1' }, booking: 'BK-2' }, quoteSchema),
    /Conflicting workflow input for booking/,
  );
});

test('throws when model sends non-object inputMapping', () => {
  assert.throws(
    () => normalizeWorkflowArguments({ inputMapping: 'BK-123' }, quoteSchema),
    /inputMapping must be an object/,
  );
});

test('drops undeclared flat fields (no injection)', () => {
  const out = normalizeWorkflowArguments(
    { booking: 'BK-123', evil: 'injected', mountedSecrets: ['STRIPE_KEY'] },
    quoteSchema,
  );
  assert.deepEqual(out, { inputMapping: { booking: 'BK-123' } });
});

test('non-workflow schema (no inputMapping) leaves args untouched', () => {
  const args = { query: 'SELECT 1' };
  const out = normalizeWorkflowArguments(args, { type: 'object', properties: { query: { type: 'string' } } });
  assert.equal(out, args);
});

test('inputMapping present but properties is not an object -> args untouched', () => {
  const args = { booking: 'BK-1' };
  const schema = { type: 'object', properties: { inputMapping: { type: 'string' } } };
  assert.equal(normalizeWorkflowArguments(args, schema), args);
});

test('inputMapping.properties is a non-object (malformed) -> args untouched, no throw', () => {
  const args = { booking: 'BK-1' };
  const schema = { type: 'object', properties: { inputMapping: { type: 'object', properties: 'nope' } } };
  assert.equal(normalizeWorkflowArguments(args, schema), args);
});

test('injected TypeScript source is self-contained and stable', () => {
  assert.ok(NORMALIZE_FN_SOURCE.includes('function normalizeWorkflowArguments'));
  assert.ok(NORMALIZE_FN_SOURCE.includes('const record ='));
  // Sanity: the injected source must not reference module-level helpers.
  assert.ok(!NORMALIZE_FN_SOURCE.match(/^import|^export/m));
});