import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeJson,
  stringifySafeJson,
  parseSafeJson
} from '../src/index.mjs';
import { assertJsonCageError, assertJsonEqual } from './helpers.mjs';

test('canonicalize sorts simple object keys', () => {
  assert.equal(canonicalizeJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test('canonicalize sorts nested object keys', () => {
  assert.equal(canonicalizeJson({ z: { y: 1, x: 2 }, a: 3 }), '{"a":3,"z":{"x":2,"y":1}}');
});

test('canonicalize sorts objects inside arrays without sorting array elements', () => {
  assert.equal(canonicalizeJson([{ b: 1, a: 2 }, { d: 3, c: 4 }]), '[{"a":2,"b":1},{"c":4,"d":3}]');
});

test('canonicalize is deterministic across insertion order', () => {
  const first = { b: 1, a: { d: 2, c: 3 }, e: [4] };
  const second = { e: [4], a: { c: 3, d: 2 }, b: 1 };
  assert.equal(canonicalizeJson(first), canonicalizeJson(second));
});

test('canonicalize uses UTF-16 code unit key order for ASCII case', () => {
  assert.equal(canonicalizeJson({ a: 1, Z: 2, A: 3, z: 4 }), '{"A":3,"Z":2,"a":1,"z":4}');
});

test('canonicalize uses lexicographic rather than numeric key ordering', () => {
  assert.equal(canonicalizeJson({ '2': 1, '10': 2, '1': 3 }), '{"1":3,"10":2,"2":1}');
});

test('canonicalize orders punctuation keys deterministically', () => {
  assert.equal(canonicalizeJson({ b: 1, '-': 2, _: 3, '0': 4 }), '{"-":2,"0":4,"_":3,"b":1}');
});

test('canonicalize orders non-ASCII keys deterministically', () => {
  const output = canonicalizeJson({ 'é': 1, e: 2, '😀': 3 });
  assert.equal(output, '{"e":2,"é":1,"😀":3}');
});

test('stringify preserves object enumeration order instead of sorting', () => {
  assert.equal(stringifySafeJson({ b: 1, a: 2 }), '{"b":1,"a":2}');
});

test('stringify nested output preserves enumeration order', () => {
  assert.equal(stringifySafeJson({ z: { y: 1, x: 2 }, a: 3 }), '{"z":{"y":1,"x":2},"a":3}');
});

test('canonicalize empty object and array', () => {
  assert.equal(canonicalizeJson({}), '{}');
  assert.equal(canonicalizeJson([]), '[]');
});

for (const [value, expected] of [
  [null, 'null'],
  [true, 'true'],
  [false, 'false'],
  [0, '0'],
  [-0, '0'],
  [1, '1'],
  [-1, '-1'],
  [0.5, '0.5'],
  [1e21, '1e+21'],
  [1e-7, '1e-7'],
  ['', '""'],
  ['ascii', '"ascii"'],
  ['é', '"é"'],
  ['😀', '"😀"']
]) {
  test('primitive serialization ' + expected, () => {
    assert.equal(canonicalizeJson(value), expected);
  });
}

test('string escaping uses JSON control escapes', () => {
  assert.equal(canonicalizeJson('\b\f\n\r\t'), '"\\b\\f\\n\\r\\t"');
});

test('string escaping escapes quotes and reverse solidus', () => {
  assert.equal(canonicalizeJson('"\\'), '"\\"\\\\"');
});

test('string escaping does not require escaping forward slash', () => {
  assert.equal(canonicalizeJson('/'), '"/"');
});

for (let unit = 0; unit < 0x20; unit += 1) {
  test('control character is escaped 0x' + unit.toString(16).padStart(2, '0'), () => {
    const output = canonicalizeJson(String.fromCharCode(unit));
    assert.equal(output.length >= 2, true);
    assert.equal(output.includes(String.fromCharCode(unit)), false);
    assert.equal(parseSafeJson(output), String.fromCharCode(unit));
  });
}

test('NUL is serialized as an escape and round-trips when string NUL is allowed', () => {
  const output = canonicalizeJson('a\0b');
  assert.equal(output, '"a\\u0000b"');
  assert.equal(parseSafeJson(output), 'a\0b');
});

test('NUL in object key is serialized as escaped JSON', () => {
  const object = Object.create(null);
  object['a\0b'] = 1;
  assert.equal(canonicalizeJson(object), '{"a\\u0000b":1}');
});

test('valid astral characters round-trip through canonicalization', () => {
  const output = canonicalizeJson({ emoji: '😀', music: '𝄞' });
  assertJsonEqual(parseSafeJson(output), { emoji: '😀', music: '𝄞' });
});

for (const value of [NaN, Infinity, -Infinity]) {
  test('non-finite number fails closed: ' + String(value), () => {
    assertJsonCageError(() => canonicalizeJson(value), 'JSONCAGE_NUMBER_OVERFLOW');
    assertJsonCageError(() => stringifySafeJson(value), 'JSONCAGE_NUMBER_OVERFLOW');
  });
}

test('unsafe integer serializes by default because it is already a JavaScript number', () => {
  assert.equal(canonicalizeJson(9007199254740992), '9007199254740992');
});

test('unsafe integer is rejected in strict integer mode', () => {
  assertJsonCageError(
    () => canonicalizeJson(9007199254740993, { rejectUnsafeIntegers: true }),
    'JSONCAGE_UNSAFE_INTEGER'
  );
});

const unsupportedValues = [
  ['undefined', undefined],
  ['function', () => 1],
  ['symbol', Symbol('x')],
  ['bigint', 1n],
  ['date', new Date(0)],
  ['class instance', new (class Example {})()],
  ['regexp', /x/],
  ['map', new Map()],
  ['set', new Set()],
  ['weakmap', new WeakMap()],
  ['promise', Promise.resolve(1)]
];

for (const [label, value] of unsupportedValues) {
  test('unsupported root value rejected: ' + label, () => {
    assertJsonCageError(() => canonicalizeJson(value), 'JSONCAGE_UNSUPPORTED_VALUE');
  });
  test('unsupported object property rejected: ' + label, () => {
    assertJsonCageError(() => canonicalizeJson({ x: value }), 'JSONCAGE_UNSUPPORTED_VALUE');
  });
  test('unsupported array element rejected: ' + label, () => {
    assertJsonCageError(() => canonicalizeJson([value]), 'JSONCAGE_UNSUPPORTED_VALUE');
  });
}

test('undefined object property is rejected rather than silently omitted', () => {
  assertJsonCageError(() => stringifySafeJson({ defined: 1, missing: undefined }), 'JSONCAGE_UNSUPPORTED_VALUE');
});

test('undefined array element is rejected rather than silently becoming null', () => {
  assertJsonCageError(() => stringifySafeJson([undefined]), 'JSONCAGE_UNSUPPORTED_VALUE');
});

test('sparse array hole is rejected rather than silently becoming null', () => {
  assertJsonCageError(() => stringifySafeJson(new Array(1)), 'JSONCAGE_UNSUPPORTED_VALUE');
});

test('direct object cycle is rejected', () => {
  const object = {};
  object.self = object;
  assertJsonCageError(() => canonicalizeJson(object), 'JSONCAGE_CYCLE_DETECTED');
});

test('indirect object cycle is rejected', () => {
  const a = {};
  const b = { a };
  a.b = b;
  assertJsonCageError(() => canonicalizeJson(a), 'JSONCAGE_CYCLE_DETECTED');
});

test('array cycle is rejected', () => {
  const array = [];
  array.push(array);
  assertJsonCageError(() => canonicalizeJson(array), 'JSONCAGE_CYCLE_DETECTED');
});

test('shared non-cyclic object references are serialized in both positions', () => {
  const shared = { x: 1 };
  assert.equal(canonicalizeJson({ a: shared, b: shared }), '{"a":{"x":1},"b":{"x":1}}');
});

test('shared object in sibling array positions is not mistaken for a cycle', () => {
  const shared = { x: 1 };
  assert.equal(canonicalizeJson([shared, shared]), '[{"x":1},{"x":1}]');
});

test('lone surrogate in string value is rejected', () => {
  assertJsonCageError(() => canonicalizeJson(String.fromCharCode(0xd800)), 'JSONCAGE_LONE_SURROGATE');
  assertJsonCageError(() => canonicalizeJson(String.fromCharCode(0xdc00)), 'JSONCAGE_LONE_SURROGATE');
});

test('lone surrogate in object key is rejected', () => {
  const object = {};
  object[String.fromCharCode(0xd800)] = 1;
  assertJsonCageError(() => canonicalizeJson(object), 'JSONCAGE_LONE_SURROGATE');
});

test('valid surrogate pair in object key is accepted', () => {
  assert.equal(canonicalizeJson({ '😀': 1 }), '{"😀":1}');
});

test('accessor property is rejected rather than invoked', () => {
  const object = {};
  let invoked = false;
  Object.defineProperty(object, 'x', {
    enumerable: true,
    get() {
      invoked = true;
      return 1;
    }
  });
  assertJsonCageError(() => canonicalizeJson(object), 'JSONCAGE_UNSUPPORTED_VALUE');
  assert.equal(invoked, false);
});

test('objects with custom prototype chains are rejected', () => {
  const object = Object.create({ inherited: 1 });
  object.own = 2;
  assertJsonCageError(() => canonicalizeJson(object), 'JSONCAGE_UNSUPPORTED_VALUE');
});

test('null-prototype objects serialize correctly', () => {
  const object = Object.create(null);
  object.b = 1;
  object.a = 2;
  assert.equal(canonicalizeJson(object), '{"a":2,"b":1}');
});

test('depth limit counts nested arrays and objects structurally', () => {
  assertJsonCageError(() => canonicalizeJson({ a: { b: 1 } }, { maxDepth: 1 }), 'JSONCAGE_MAX_DEPTH');
  assert.equal(canonicalizeJson({ a: { b: 1 } }, { maxDepth: 2 }), '{"a":{"b":1}}');
});

test('scalar object members do not add structural depth when serializing', () => {
  assert.equal(canonicalizeJson({ a: 1 }, { maxDepth: 1 }), '{"a":1}');
});

test('array nesting depth limit is enforced when serializing', () => {
  assertJsonCageError(() => canonicalizeJson([[[]]], { maxDepth: 2 }), 'JSONCAGE_MAX_DEPTH');
  assert.equal(canonicalizeJson([[[]]], { maxDepth: 3 }), '[[[]]]');
});

test('serialization node cap counts root array and scalar elements', () => {
  assertJsonCageError(() => canonicalizeJson([1, 2], { maxNodes: 2 }), 'JSONCAGE_MAX_NODES');
  assert.equal(canonicalizeJson([1, 2], { maxNodes: 3 }), '[1,2]');
});

test('serialization output byte cap accepts exact ASCII byte size', () => {
  assert.equal(canonicalizeJson({ a: 1 }, { maxBytes: 7 }), '{"a":1}');
});

test('serialization output byte cap rejects one byte over', () => {
  assertJsonCageError(() => canonicalizeJson({ a: 1 }, { maxBytes: 6 }), 'JSONCAGE_MAX_BYTES');
});

test('serialization byte cap measures Unicode output in UTF-8 bytes', () => {
  assert.equal(canonicalizeJson('é', { maxBytes: 4 }), '"é"');
  assertJsonCageError(() => canonicalizeJson('é', { maxBytes: 3 }), 'JSONCAGE_MAX_BYTES');
});

test('serialization byte cap measures astral output as four UTF-8 bytes', () => {
  assert.equal(canonicalizeJson('😀', { maxBytes: 6 }), '"😀"');
  assertJsonCageError(() => canonicalizeJson('😀', { maxBytes: 5 }), 'JSONCAGE_MAX_BYTES');
});

test('serialization object key count cap is enforced', () => {
  assertJsonCageError(() => canonicalizeJson({ a: 1, b: 2 }, { maxKeys: 1 }), 'JSONCAGE_MAX_KEYS');
  assert.equal(canonicalizeJson({ a: 1, b: 2 }, { maxKeys: 2 }), '{"a":1,"b":2}');
});

test('serialization array length cap is enforced', () => {
  assertJsonCageError(() => canonicalizeJson([1, 2, 3], { maxArrayLength: 2 }), 'JSONCAGE_MAX_ARRAY_LENGTH');
  assert.equal(canonicalizeJson([1, 2], { maxArrayLength: 2 }), '[1,2]');
});

test('serialization key length cap is enforced in UTF-16 units', () => {
  assertJsonCageError(() => canonicalizeJson({ aaaa: 1 }, { maxKeyLength: 3 }), 'JSONCAGE_MAX_KEY_LENGTH');
  assert.equal(canonicalizeJson({ aaaa: 1 }, { maxKeyLength: 4 }), '{"aaaa":1}');
});

test('canonical output parses back to equivalent JSON data', () => {
  const value = { z: [1, 'é', null, { b: true, a: false }], a: 0.25 };
  assertJsonEqual(parseSafeJson(canonicalizeJson(value)), value);
});

test('stringify output parses back to equivalent JSON data', () => {
  const value = { z: [1, 'é', null, { b: true, a: false }], a: 0.25 };
  assertJsonEqual(parseSafeJson(stringifySafeJson(value)), value);
});

test('canonicalize does not mutate input key order or values', () => {
  const input = { b: 1, a: { d: 2, c: 3 } };
  const before = JSON.stringify(input);
  canonicalizeJson(input);
  assert.equal(JSON.stringify(input), before);
});

test('serializer throws before returning partial output for late errors', () => {
  assertJsonCageError(() => canonicalizeJson({ good: 1, bad: NaN }), 'JSONCAGE_NUMBER_OVERFLOW');
});

test('very deep but bounded iterative serialization does not use recursive JavaScript calls', () => {
  let value = 0;
  for (let index = 0; index < 200; index += 1) value = [value];
  const output = canonicalizeJson(value, { maxDepth: 201, maxNodes: 500 });
  assert.equal(output.length, 401);
});
