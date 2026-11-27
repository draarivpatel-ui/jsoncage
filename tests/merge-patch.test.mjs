import test from 'node:test';
import assert from 'node:assert/strict';
import { applySafeMergePatch } from '../src/index.mjs';
import { assertJsonCageError, assertJsonEqual } from './helpers.mjs';

const rfcExamples = [
  [{ a: 'b' }, { a: 'c' }, { a: 'c' }],
  [{ a: 'b' }, { b: 'c' }, { a: 'b', b: 'c' }],
  [{ a: 'b' }, { a: null }, {}],
  [{ a: 'b', b: 'c' }, { a: null }, { b: 'c' }],
  [{ a: ['b'] }, { a: 'c' }, { a: 'c' }],
  [{ a: 'c' }, { a: ['b'] }, { a: ['b'] }],
  [{ a: { b: 'c' } }, { a: { b: 'd', c: null } }, { a: { b: 'd' } }],
  [{ a: [{ b: 'c' }] }, { a: [1] }, { a: [1] }],
  [['a', 'b'], ['c', 'd'], ['c', 'd']],
  [{ a: 'b' }, ['c'], ['c']],
  [{ a: 'foo' }, null, null],
  [{ a: 'foo' }, 'bar', 'bar'],
  [{ e: null }, { a: 1 }, { e: null, a: 1 }],
  [[1, 2], { a: 'b', c: null }, { a: 'b' }],
  [{}, { a: { bb: { ccc: null } } }, { a: { bb: {} } }]
];

for (const [index, [target, patch, expected]] of rfcExamples.entries()) {
  test('RFC 7396 example ' + (index + 1), () => {
    assertJsonEqual(applySafeMergePatch(target, patch), expected);
  });
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

test('frozen target and frozen patch can be merged without mutation attempts', () => {
  const target = deepFreeze({ a: deepFreeze({ keep: 1, remove: 2 }) });
  const patch = deepFreeze({ a: deepFreeze({ remove: null, added: 3 }) });
  assertJsonEqual(applySafeMergePatch(target, patch), { a: { keep: 1, added: 3 } });
});

test('target object identity and nested object identity are not reused', () => {
  const target = { nested: { value: 1 }, list: [1] };
  const result = applySafeMergePatch(target, {});
  assert.notEqual(result, target);
  assert.notEqual(result.nested, target.nested);
  assert.notEqual(result.list, target.list);
  assertJsonEqual(result, target);
});

test('patch object identity and nested array identity are not reused', () => {
  const patch = { replacement: { value: 1 }, list: [1] };
  const result = applySafeMergePatch({}, patch);
  assert.notEqual(result.replacement, patch.replacement);
  assert.notEqual(result.list, patch.list);
});

test('target remains deeply unchanged after merge', () => {
  const target = { a: { keep: 1, remove: 2 }, b: [1] };
  const before = JSON.stringify(target);
  applySafeMergePatch(target, { a: { remove: null, added: 3 }, b: [2] });
  assert.equal(JSON.stringify(target), before);
});

test('patch remains deeply unchanged after merge', () => {
  const patch = { a: { remove: null, added: 3 }, b: [2] };
  const before = JSON.stringify(patch);
  applySafeMergePatch({ a: { remove: 1 } }, patch);
  assert.equal(JSON.stringify(patch), before);
});

test('target remains unchanged when merge fails halfway', () => {
  const target = { keep: { value: 1 }, other: 2 };
  const before = JSON.stringify(target);
  assertJsonCageError(
    () => applySafeMergePatch(target, { later: objectWithDangerousKey('__proto__', 1) }),
    'JSONCAGE_PROTOTYPE_KEY'
  );
  assert.equal(JSON.stringify(target), before);
});

test('result objects have null prototypes recursively', () => {
  const result = applySafeMergePatch({ a: { b: 1 } }, { c: { d: 2 } });
  assert.equal(Object.getPrototypeOf(result), null);
  assert.equal(Object.getPrototypeOf(result.a), null);
  assert.equal(Object.getPrototypeOf(result.c), null);
});

test('patch object null deletes a target key', () => {
  assertJsonEqual(applySafeMergePatch({ a: 1, b: 2 }, { a: null }), { b: 2 });
});

test('patch object null for absent key is a no-op', () => {
  assertJsonEqual(applySafeMergePatch({ b: 2 }, { a: null }), { b: 2 });
});

test('nested null deletes only nested key', () => {
  assertJsonEqual(applySafeMergePatch({ a: { x: 1, y: 2 } }, { a: { x: null } }), { a: { y: 2 } });
});

test('object patch replaces scalar target branch with an object', () => {
  assertJsonEqual(applySafeMergePatch({ a: 1 }, { a: { b: 2 } }), { a: { b: 2 } });
});

test('scalar patch replaces object target branch', () => {
  assertJsonEqual(applySafeMergePatch({ a: { b: 2 } }, { a: 1 }), { a: 1 });
});

test('array patch replaces object target branch', () => {
  assertJsonEqual(applySafeMergePatch({ a: { b: 2 } }, { a: [1] }), { a: [1] });
});

test('object patch against array target treats target as empty object at that branch', () => {
  assertJsonEqual(applySafeMergePatch({ a: [1, 2] }, { a: { b: 3 } }), { a: { b: 3 } });
});

test('root array target with object patch is treated as empty object', () => {
  assertJsonEqual(applySafeMergePatch([1, 2], { a: 1 }), { a: 1 });
});

test('root scalar target with object patch is treated as empty object', () => {
  assertJsonEqual(applySafeMergePatch('x', { a: 1 }), { a: 1 });
});

test('undefined target is rejected because it is not a JSON value', () => {
  assertJsonCageError(() => applySafeMergePatch(undefined, { a: 1 }), 'JSONCAGE_UNSUPPORTED_VALUE');
});

for (const primitive of [null, true, false, 0, 'x']) {
  test('root primitive patch replaces target with ' + JSON.stringify(primitive), () => {
    assertJsonEqual(applySafeMergePatch({ a: 1 }, primitive), primitive);
  });
}

test('root empty array patch replaces target', () => {
  assertJsonEqual(applySafeMergePatch({ a: 1 }, []), []);
});

test('root empty object patch preserves target content in a fresh object', () => {
  const target = { a: { b: 1 } };
  const result = applySafeMergePatch(target, {});
  assertJsonEqual(result, target);
  assert.notEqual(result, target);
});

function objectWithDangerousKey(key, value) {
  const object = Object.create(null);
  object[key] = value;
  return object;
}

for (const key of ['__proto__', 'constructor', 'prototype']) {
  test('patch dangerous key rejected: ' + key, () => {
    assertJsonCageError(() => applySafeMergePatch({}, objectWithDangerousKey(key, 1)), 'JSONCAGE_PROTOTYPE_KEY');
  });
  test('target dangerous key rejected when copied: ' + key, () => {
    assertJsonCageError(() => applySafeMergePatch(objectWithDangerousKey(key, 1), {}), 'JSONCAGE_PROTOTYPE_KEY');
  });
  test('nested patch dangerous key rejected: ' + key, () => {
    assertJsonCageError(() => applySafeMergePatch({}, { nested: objectWithDangerousKey(key, 1) }), 'JSONCAGE_PROTOTYPE_KEY');
  });
  test('dangerous key strip mode removes key: ' + key, () => {
    const result = applySafeMergePatch(objectWithDangerousKey(key, 1), objectWithDangerousKey(key, 2), { protoPolicy: 'strip' });
    assert.equal(Object.hasOwn(result, key), false);
  });
}

test('target objects with custom prototype chains are rejected as non-JSON data', () => {
  const base = { inherited: 1 };
  const target = Object.create(base);
  target.own = 2;
  assertJsonCageError(() => applySafeMergePatch(target, {}), 'JSONCAGE_UNSUPPORTED_VALUE');
});

test('patch objects with custom prototype chains are rejected as non-JSON data', () => {
  const base = { inherited: 1 };
  const patch = Object.create(base);
  patch.own = 2;
  assertJsonCageError(() => applySafeMergePatch({}, patch), 'JSONCAGE_UNSUPPORTED_VALUE');
});

test('target accessor property is rejected rather than invoked', () => {
  const target = {};
  let invoked = false;
  Object.defineProperty(target, 'x', {
    enumerable: true,
    get() {
      invoked = true;
      return 1;
    }
  });
  assertJsonCageError(() => applySafeMergePatch(target, {}), 'JSONCAGE_UNSUPPORTED_VALUE');
  assert.equal(invoked, false);
});

test('patch accessor property is rejected rather than invoked', () => {
  const patch = {};
  let invoked = false;
  Object.defineProperty(patch, 'x', {
    enumerable: true,
    get() {
      invoked = true;
      return 1;
    }
  });
  assertJsonCageError(() => applySafeMergePatch({}, patch), 'JSONCAGE_UNSUPPORTED_VALUE');
  assert.equal(invoked, false);
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
  ['set', new Set()]
];

for (const [label, value] of unsupportedValues) {
  test('unsupported patch value rejected: ' + label, () => {
    assertJsonCageError(() => applySafeMergePatch({}, { x: value }), 'JSONCAGE_UNSUPPORTED_VALUE');
  });
  test('unsupported target value rejected when copied: ' + label, () => {
    assertJsonCageError(() => applySafeMergePatch({ x: value }, {}), 'JSONCAGE_UNSUPPORTED_VALUE');
  });
}

for (const value of [NaN, Infinity, -Infinity]) {
  test('non-finite patch number rejected: ' + String(value), () => {
    assertJsonCageError(() => applySafeMergePatch({}, { x: value }), 'JSONCAGE_NUMBER_OVERFLOW');
  });
}

test('unsafe integer in merge patch is rejected in strict integer mode', () => {
  assertJsonCageError(
    () => applySafeMergePatch({}, { x: 9007199254740993 }, { rejectUnsafeIntegers: true }),
    'JSONCAGE_UNSAFE_INTEGER'
  );
});

test('lone surrogate in patch string is rejected', () => {
  assertJsonCageError(() => applySafeMergePatch({}, { x: String.fromCharCode(0xd800) }), 'JSONCAGE_LONE_SURROGATE');
});

test('lone surrogate in target key is rejected', () => {
  const target = Object.create(null);
  target[String.fromCharCode(0xd800)] = 1;
  assertJsonCageError(() => applySafeMergePatch(target, {}), 'JSONCAGE_LONE_SURROGATE');
});

test('target cyclic object graph is rejected', () => {
  const target = {};
  target.self = target;
  assertJsonCageError(() => applySafeMergePatch(target, {}), 'JSONCAGE_CYCLE_DETECTED');
});

test('patch cyclic object graph is rejected', () => {
  const patch = {};
  patch.self = patch;
  assertJsonCageError(() => applySafeMergePatch({}, patch), 'JSONCAGE_CYCLE_DETECTED');
});

test('array cycle inside replacement is rejected', () => {
  const array = [];
  array.push(array);
  assertJsonCageError(() => applySafeMergePatch({}, { x: array }), 'JSONCAGE_CYCLE_DETECTED');
});

test('shared but non-cyclic object references are accepted', () => {
  const shared = { x: 1 };
  const result = applySafeMergePatch({}, { a: shared, b: { c: shared } });
  assertJsonEqual(result, { a: { x: 1 }, b: { c: { x: 1 } } });
});

test('merge depth limit is enforced for nested patch objects', () => {
  assertJsonCageError(
    () => applySafeMergePatch({}, { a: { b: 1 } }, { maxDepth: 1 }),
    'JSONCAGE_MAX_DEPTH'
  );
  assertJsonEqual(applySafeMergePatch({}, { a: { b: 1 } }, { maxDepth: 2 }), { a: { b: 1 } });
});

test('merge depth limit is enforced for arrays inside patch', () => {
  assertJsonCageError(
    () => applySafeMergePatch({}, { a: [[1]] }, { maxDepth: 2 }),
    'JSONCAGE_MAX_DEPTH'
  );
  assertJsonEqual(applySafeMergePatch({}, { a: [[1]] }, { maxDepth: 3 }), { a: [[1]] });
});

test('merge key count limit applies to patch objects', () => {
  assertJsonCageError(() => applySafeMergePatch({}, { a: 1, b: 2 }, { maxKeys: 1 }), 'JSONCAGE_MAX_KEYS');
});

test('merge key count limit applies to target objects copied by empty patch', () => {
  assertJsonCageError(() => applySafeMergePatch({ a: 1, b: 2 }, {}, { maxKeys: 1 }), 'JSONCAGE_MAX_KEYS');
});

test('merge key count limit applies to union of target and patch keys', () => {
  assertJsonCageError(() => applySafeMergePatch({ a: 1 }, { b: 2 }, { maxKeys: 1 }), 'JSONCAGE_MAX_KEYS');
  assertJsonEqual(applySafeMergePatch({ a: 1 }, { b: 2 }, { maxKeys: 2 }), { a: 1, b: 2 });
});

test('merge key length limit is enforced', () => {
  assertJsonCageError(() => applySafeMergePatch({}, { aaaa: 1 }, { maxKeyLength: 3 }), 'JSONCAGE_MAX_KEY_LENGTH');
  assertJsonEqual(applySafeMergePatch({}, { aaaa: 1 }, { maxKeyLength: 4 }), { aaaa: 1 });
});

test('merge array length limit is enforced', () => {
  assertJsonCageError(() => applySafeMergePatch({}, { a: [1, 2, 3] }, { maxArrayLength: 2 }), 'JSONCAGE_MAX_ARRAY_LENGTH');
  assertJsonEqual(applySafeMergePatch({}, { a: [1, 2] }, { maxArrayLength: 2 }), { a: [1, 2] });
});

test('merge node cap stops a broad patch bomb', () => {
  const patch = {};
  for (let index = 0; index < 20; index += 1) patch['k' + index] = index;
  assertJsonCageError(() => applySafeMergePatch({}, patch, { maxNodes: 10, maxKeys: 100 }), 'JSONCAGE_MAX_NODES');
});

test('merge node cap counts copied target data', () => {
  const target = {};
  for (let index = 0; index < 10; index += 1) target['k' + index] = index;
  assertJsonCageError(() => applySafeMergePatch(target, {}, { maxNodes: 5, maxKeys: 100 }), 'JSONCAGE_MAX_NODES');
});

test('patch bomb does not mutate target before rejection', () => {
  const target = { safe: 1 };
  const patch = {};
  for (let index = 0; index < 20; index += 1) patch['k' + index] = index;
  assertJsonCageError(() => applySafeMergePatch(target, patch, { maxNodes: 5, maxKeys: 100 }), 'JSONCAGE_MAX_NODES');
  assert.deepEqual(target, { safe: 1 });
});

test('hole in replacement array is unsupported rather than silently null', () => {
  const array = new Array(1);
  assertJsonCageError(() => applySafeMergePatch({}, { x: array }), 'JSONCAGE_UNSUPPORTED_VALUE');
});

test('null prototype inputs merge correctly', () => {
  const target = Object.create(null);
  target.a = 1;
  const patch = Object.create(null);
  patch.b = 2;
  const result = applySafeMergePatch(target, patch);
  assertJsonEqual(result, { a: 1, b: 2 });
});

test('root null patch returns null rather than an object', () => {
  assert.equal(applySafeMergePatch({ a: 1 }, null), null);
});

test('function root target is rejected because it is not a JSON value', () => {
  assertJsonCageError(() => applySafeMergePatch(() => 1, { a: 1 }), 'JSONCAGE_UNSUPPORTED_VALUE');
});

test('NaN root target is rejected because it is not a finite JSON number', () => {
  assertJsonCageError(() => applySafeMergePatch(NaN, { a: 1 }), 'JSONCAGE_NUMBER_OVERFLOW');
});

test('valid scalar root target is treated as empty object for an object patch', () => {
  assertJsonEqual(applySafeMergePatch(0, { a: 1 }), { a: 1 });
});

