import assert from 'node:assert/strict';
import { JsonCageError, canonicalizeJson } from '../src/index.mjs';

export function assertJsonCageError(fn, code) {
  let caught;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, 'expected function to throw');
  assert.equal(caught instanceof JsonCageError, true, 'expected JsonCageError');
  assert.equal(caught.code, code);
  return caught;
}

export function assertJsonEqual(actual, expected, message) {
  assert.equal(canonicalizeJson(actual), canonicalizeJson(expected), message);
}

export function codesFrom(report) {
  return report.findings.map((finding) => finding.code);
}

export function nestedArray(depth, leaf = null) {
  return '['.repeat(depth) + JSON.stringify(leaf) + ']'.repeat(depth);
}

export function nestedObject(depth, key = 'a') {
  let value = 'null';
  for (let index = 0; index < depth; index += 1) value = '{"' + key + '":' + value + '}';
  return value;
}

export function objectWithKeys(count, prefix = 'k') {
  const parts = [];
  for (let index = 0; index < count; index += 1) parts.push(JSON.stringify(prefix + index) + ':0');
  return '{' + parts.join(',') + '}';
}

export function arrayWithItems(count) {
  return '[' + '0,'.repeat(Math.max(0, count - 1)) + (count > 0 ? '0' : '') + ']';
}
