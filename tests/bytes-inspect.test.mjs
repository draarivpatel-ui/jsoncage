import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSafeJsonBytes, inspectJsonPayload } from '../src/index.mjs';
import { assertJsonCageError, assertJsonEqual, codesFrom } from './helpers.mjs';

const invalidUtf8Cases = [
  ['lone continuation 80', [0x80]],
  ['lone continuation bf', [0xbf]],
  ['overlong NUL', [0xc0, 0x80]],
  ['overlong slash', [0xc0, 0xaf]],
  ['truncated two byte sequence', [0xc2]],
  ['two byte sequence followed by ASCII', [0xc2, 0x41]],
  ['truncated three byte sequence one byte', [0xe1]],
  ['truncated three byte sequence two bytes', [0xe1, 0x80]],
  ['three byte sequence bad continuation', [0xe1, 0x41, 0x80]],
  ['overlong three byte sequence', [0xe0, 0x80, 0x80]],
  ['encoded high surrogate', [0xed, 0xa0, 0x80]],
  ['encoded low surrogate', [0xed, 0xb0, 0x80]],
  ['truncated four byte sequence one byte', [0xf0]],
  ['truncated four byte sequence two bytes', [0xf0, 0x90]],
  ['truncated four byte sequence three bytes', [0xf0, 0x90, 0x80]],
  ['four byte sequence bad continuation', [0xf0, 0x90, 0x41, 0x80]],
  ['overlong four byte sequence', [0xf0, 0x80, 0x80, 0x80]],
  ['out of range five byte prefix', [0xf5, 0x80, 0x80, 0x80]],
  ['byte fe is invalid', [0xfe]],
  ['byte ff is invalid', [0xff]],
  ['valid prefix then invalid tail', ...[[0x22, 0x61, 0x22, 0x20, 0xff]]],
  ['bom prefix then invalid continuation', [0xef, 0xbb, 0xbf, 0x80]]
];

for (const [label, bytes] of invalidUtf8Cases) {
  test('invalid UTF-8 fails closed: ' + label, () => {
    assertJsonCageError(() => parseSafeJsonBytes(new Uint8Array(bytes), { rejectBom: false }), 'JSONCAGE_INVALID_UTF8');
  });
}

test('ASCII bytes parse correctly', () => {
  assertJsonEqual(parseSafeJsonBytes(new TextEncoder().encode('{"a":1}')), { a: 1 });
});

test('two byte UTF-8 sequence parses correctly', () => {
  assert.equal(parseSafeJsonBytes(new Uint8Array([0x22, 0xc3, 0xa9, 0x22])), 'é');
});

test('three byte UTF-8 sequence parses correctly', () => {
  assert.equal(parseSafeJsonBytes(new Uint8Array([0x22, 0xe2, 0x98, 0x83, 0x22])), '☃');
});

test('four byte UTF-8 sequence parses correctly', () => {
  assert.equal(parseSafeJsonBytes(new Uint8Array([0x22, 0xf0, 0x9f, 0x98, 0x80, 0x22])), '😀');
});

test('mixed Unicode document parses correctly', () => {
  const source = '{"ascii":"a","e":"é","snowman":"☃","emoji":"😀"}';
  assertJsonEqual(parseSafeJsonBytes(new TextEncoder().encode(source)), {
    ascii: 'a',
    e: 'é',
    snowman: '☃',
    emoji: '😀'
  });
});

test('UTF-8 BOM bytes are rejected by default', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
  assertJsonCageError(() => parseSafeJsonBytes(bytes), 'JSONCAGE_BOM_REJECTED');
});

test('UTF-8 BOM bytes can be explicitly allowed', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
  assertJsonEqual(parseSafeJsonBytes(bytes, { rejectBom: false }), {});
});

test('byte input limit accepts exact size', () => {
  const bytes = new TextEncoder().encode('null');
  assert.equal(parseSafeJsonBytes(bytes, { maxBytes: 4 }), null);
});

test('byte input limit rejects one byte over before decoding', () => {
  const bytes = new TextEncoder().encode('null');
  assertJsonCageError(() => parseSafeJsonBytes(bytes, { maxBytes: 3 }), 'JSONCAGE_MAX_BYTES');
});

test('invalid bytes over byte limit report max bytes rather than decode details', () => {
  assertJsonCageError(() => parseSafeJsonBytes(new Uint8Array([0xff, 0xff, 0xff]), { maxBytes: 2 }), 'JSONCAGE_MAX_BYTES');
});

test('ArrayBuffer input is accepted', () => {
  const bytes = new TextEncoder().encode('[1,2]');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  assertJsonEqual(parseSafeJsonBytes(buffer), [1, 2]);
});

test('DataView input is accepted', () => {
  const bytes = new TextEncoder().encode('[true,false]');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assertJsonEqual(parseSafeJsonBytes(view), [true, false]);
});

test('Buffer input is accepted as a Uint8Array subclass', () => {
  assertJsonEqual(parseSafeJsonBytes(Buffer.from('{"buffer":true}', 'utf8')), { buffer: true });
});

test('string input to parseSafeJsonBytes is an invalid input error', () => {
  assertJsonCageError(() => parseSafeJsonBytes('{}'), 'JSONCAGE_INVALID_INPUT');
});

test('number input to parseSafeJsonBytes is an invalid input error', () => {
  assertJsonCageError(() => parseSafeJsonBytes(1), 'JSONCAGE_INVALID_INPUT');
});

test('inspect reports invalid UTF-8 as a stable finding', () => {
  const report = inspectJsonPayload(new Uint8Array([0xff]));
  assert.equal(report.ok, false);
  assert.deepEqual(codesFrom(report), ['JSONCAGE_INVALID_UTF8']);
  assert.equal(report.stats.bytes, 1);
});

test('inspect reports byte input size for syntactically valid Unicode', () => {
  const input = new TextEncoder().encode('"é"');
  const report = inspectJsonPayload(input);
  assert.equal(report.ok, true);
  assert.equal(report.stats.bytes, 4);
});

test('inspect detects duplicate keys in byte input', () => {
  const report = inspectJsonPayload(new TextEncoder().encode('{"a":1,"\\u0061":2}'));
  assert.equal(report.ok, false);
  assert.deepEqual(codesFrom(report), ['JSONCAGE_DUPLICATE_KEY']);
});

test('inspect detects BOM in byte input and can continue to audit syntax', () => {
  const report = inspectJsonPayload(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]));
  assert.equal(report.ok, false);
  assert.deepEqual(codesFrom(report), ['JSONCAGE_BOM_REJECTED']);
});

test('empty byte input is a JSON syntax finding', () => {
  const report = inspectJsonPayload(new Uint8Array(0));
  assert.equal(report.ok, false);
  assert.deepEqual(codesFrom(report), ['JSONCAGE_SYNTAX_ERROR']);
});

test('zero-length Uint8Array view with nonzero offset is handled correctly', () => {
  const backing = new Uint8Array([0x41, 0x7b, 0x7d, 0x42]);
  const view = new Uint8Array(backing.buffer, 1, 2);
  assertJsonEqual(parseSafeJsonBytes(view), {});
});

test('subarray invalid bytes do not become valid because backing bytes are valid', () => {
  const backing = new Uint8Array([0x7b, 0xff, 0x7d]);
  const view = backing.subarray(1, 2);
  assertJsonCageError(() => parseSafeJsonBytes(view), 'JSONCAGE_INVALID_UTF8');
});
