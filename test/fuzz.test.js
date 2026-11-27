import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { JsonCageError, parseSafeJson } from '../src/index.mjs';

function outcome(fn) {
  try {
    return { value: fn(), error: null };
  } catch (error) {
    return { value: null, error };
  }
}

function assertJsonCage(error) {
  assert.ok(error instanceof JsonCageError, 'unexpected error type');
  assert.match(error.code, /^JSONCAGE_/);
}

function dangerousDocument(key, depth, wrappers) {
  let document = '{' + JSON.stringify(key) + ':{"polluted":true}}';
  for (let index = 0; index < depth; index += 1) {
    document = wrappers[index % wrappers.length] === 'array'
      ? '[' + document + ']'
      : '{"safe":' + document + '}';
  }
  return document;
}

function assertNoDangerousOwnKeys(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoDangerousOwnKeys(item);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      assert.ok(key !== '__proto__' && key !== 'constructor' && key !== 'prototype');
      assertNoDangerousOwnKeys(value[key]);
    }
  }
}

test('fast-check nested prototype-pollution keys are rejected at every depth', () => {
  const wrapperList = fc.array(fc.constantFrom('array', 'object'), { minLength: 8, maxLength: 8 });
  fc.assert(fc.property(
    fc.constantFrom('__proto__', 'constructor', 'prototype'),
    fc.integer({ min: 0, max: 8 }),
    wrapperList,
    (key, depth, wrappers) => {
      const source = dangerousDocument(key, depth, wrappers);
      assert.throws(
        () => parseSafeJson(source),
        (error) => error instanceof JsonCageError && error.code === 'JSONCAGE_PROTOTYPE_KEY'
      );
      assert.equal({}.polluted, undefined);
      assert.equal(Object.prototype.polluted, undefined);
    }
  ), { seed: 0x150c01, numRuns: 180 });
});

test('fast-check parser depth bound is exact and fails without platform recursion errors', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 40 }), (depth) => {
    const source = '['.repeat(depth) + '0' + ']'.repeat(depth);
    const result = outcome(() => parseSafeJson(source, { maxDepth: 8, maxNodes: 1000 }));
    if (depth <= 8) {
      assert.equal(result.error, null);
      assert.equal(Array.isArray(result.value), true);
    } else {
      assert.ok(result.error instanceof JsonCageError, 'unexpected error type');
      assert.equal(result.error.code, 'JSONCAGE_MAX_DEPTH');
    }
  }), { seed: 0xde907, numRuns: 140 });
});

test('fast-check arbitrary hostile byte strings only produce JsonCageError or bounded values', () => {
  const hostile = fc.string({ unit: 'binary', minLength: 0, maxLength: 160 });
  fc.assert(fc.property(hostile, (input) => {
    const result = outcome(() => parseSafeJson(input, {
      maxBytes: 2048,
      maxDepth: 8,
      maxNodes: 500,
      maxKeys: 40,
      maxArrayLength: 100,
      maxStringLength: 120,
      maxKeyLength: 40
    }));
    if (result.error) {
      assertJsonCage(result.error);
    } else {
      assertNoDangerousOwnKeys(result.value);
    }
    assert.equal({}.polluted, undefined);
  }), { seed: 0x150c02, numRuns: 220 });
});

test('fast-check strip mode removes dangerous keys recursively without pollution', () => {
  const wrapperList = fc.array(fc.constantFrom('array', 'object'), { minLength: 8, maxLength: 8 });
  fc.assert(fc.property(
    fc.constantFrom('__proto__', 'constructor', 'prototype'),
    fc.integer({ min: 0, max: 8 }),
    wrapperList,
    (key, depth, wrappers) => {
      const source = dangerousDocument(key, depth, wrappers);
      const value = parseSafeJson(source, { protoPolicy: 'strip' });
      assertNoDangerousOwnKeys(value);
      assert.equal({}.polluted, undefined);
      assert.equal(Object.prototype.polluted, undefined);
    }
  ), { seed: 0x150c03, numRuns: 160 });
});
