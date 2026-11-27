import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveJsonPointer } from '../src/index.mjs';
import { assertJsonCageError, assertJsonEqual } from './helpers.mjs';

const rfcDocument = {
  foo: ['bar', 'baz'],
  '': 0,
  'a/b': 1,
  'c%d': 2,
  'e^f': 3,
  'g|h': 4,
  'i\\j': 5,
  'k"l': 6,
  ' ': 7,
  'm~n': 8
};

const rfcExamples = [
  ['/foo', ['bar', 'baz']],
  ['/foo/0', 'bar'],
  ['/', 0],
  ['/a~1b', 1],
  ['/c%d', 2],
  ['/e^f', 3],
  ['/g|h', 4],
  ['/i\\j', 5],
  ['/k"l', 6],
  ['/ ', 7],
  ['/m~0n', 8]
];

for (const [pointer, expected] of rfcExamples) {
  test('RFC 6901 example resolves ' + pointer, () => {
    assertJsonEqual(resolveJsonPointer(rfcDocument, pointer), expected);
  });
}

test('empty pointer returns the original document reference', () => {
  const document = { a: [1] };
  assert.equal(resolveJsonPointer(document, ''), document);
});

test('empty pointer returns primitive document', () => {
  assert.equal(resolveJsonPointer(42, ''), 42);
});

test('unicode object key resolves literally', () => {
  assert.equal(resolveJsonPointer({ 'é😀': 5 }, '/é😀'), 5);
});

test('nested empty keys resolve through adjacent slashes', () => {
  assert.equal(resolveJsonPointer({ '': { '': 9 } }, '//'), 9);
});

test('trailing slash is an empty object key', () => {
  assert.equal(resolveJsonPointer({ a: { '': 3 } }, '/a/'), 3);
});

test('escaped slash and tilde compose in one segment', () => {
  assert.equal(resolveJsonPointer({ '~/x': 4 }, '/~0~1x'), 4);
});

test('multiple escape sequences decode in order', () => {
  assert.equal(resolveJsonPointer({ '~~//': 7 }, '/~0~0~1~1'), 7);
});

test('decoded tilde escape does not recursively decode following digits', () => {
  assert.equal(resolveJsonPointer({ '~1x': 2 }, '/~01x'), 2);
  assert.equal(resolveJsonPointer({ '/0x': 3 }, '/~10x'), 3);
});

const invalidTildePointers = ['/~', '/~2', '/~x', '/a~', '/a~2b', '/~~'];
for (const pointer of invalidTildePointers) {
  test('invalid tilde escape rejected ' + pointer, () => {
    assertJsonCageError(() => resolveJsonPointer({ a: 1 }, pointer), 'JSONCAGE_POINTER_SYNTAX');
  });
}

for (const pointer of ['a', 'a/b', '0', 'foo/bar', '~0']) {
  test('pointer without leading slash rejected ' + JSON.stringify(pointer), () => {
    assertJsonCageError(() => resolveJsonPointer({}, pointer), 'JSONCAGE_POINTER_SYNTAX');
  });
}

for (const key of ['__proto__', 'constructor', 'prototype']) {
  test('dangerous pointer segment rejected at root: ' + key, () => {
    assertJsonCageError(() => resolveJsonPointer({}, '/' + key), 'JSONCAGE_PROTOTYPE_KEY');
  });
  test('dangerous pointer segment rejected when nested: ' + key, () => {
    assertJsonCageError(() => resolveJsonPointer({ a: {} }, '/a/' + key), 'JSONCAGE_PROTOTYPE_KEY');
  });
  test('dangerous pointer segment rejected even when own data key exists: ' + key, () => {
    const document = Object.create(null);
    document[key] = 1;
    assertJsonCageError(() => resolveJsonPointer(document, '/' + key), 'JSONCAGE_PROTOTYPE_KEY');
  });
}

for (const key of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', '__defineGetter__']) {
  test('inherited object property cannot be read: ' + key, () => {
    assertJsonCageError(() => resolveJsonPointer({}, '/' + key), 'JSONCAGE_POINTER_NOT_FOUND');
  });
}

test('own toString data property can be read because it is not a dangerous key', () => {
  const document = Object.create(null);
  document.toString = 'safe data';
  assert.equal(resolveJsonPointer(document, '/toString'), 'safe data');
});

test('null prototype object own keys resolve normally', () => {
  const document = Object.create(null);
  document.answer = 42;
  assert.equal(resolveJsonPointer(document, '/answer'), 42);
});

const validArrayIndexes = [
  ['0', 'zero'],
  ['1', 'one'],
  ['2', 'two'],
  ['10', 'ten']
];
for (const [segment, expected] of validArrayIndexes) {
  test('canonical array index accepted ' + segment, () => {
    const array = ['zero', 'one', 'two', ...Array(7).fill('pad'), 'ten'];
    assert.equal(resolveJsonPointer(array, '/' + segment), expected);
  });
}

const invalidArrayIndexes = [
  '00', '01', '000', '-0', '-1', '+0', '+1', '1.0', '1e0', ' 1', '1 ', 'x', '-', '', '1x'
];
for (const segment of invalidArrayIndexes) {
  test('non-canonical array index rejected ' + JSON.stringify(segment), () => {
    assertJsonCageError(() => resolveJsonPointer(['a', 'b'], '/' + segment), 'JSONCAGE_POINTER_NOT_FOUND');
  });
}

for (const segment of ['2', '3', '10', '9999999999999999']) {
  test('out-of-range array index rejected ' + segment, () => {
    assertJsonCageError(() => resolveJsonPointer(['a', 'b'], '/' + segment), 'JSONCAGE_POINTER_NOT_FOUND');
  });
}

test('array traversal continues into object property', () => {
  assert.equal(resolveJsonPointer({ a: [{ b: 4 }] }, '/a/0/b'), 4);
});

test('object traversal continues into array index', () => {
  assert.equal(resolveJsonPointer({ a: { b: [5] } }, '/a/b/0'), 5);
});

for (const primitive of [null, true, false, 0, 'x']) {
  test('cannot traverse through primitive ' + JSON.stringify(primitive), () => {
    assertJsonCageError(() => resolveJsonPointer(primitive, '/a'), 'JSONCAGE_POINTER_NOT_FOUND');
  });
}

test('missing object key is not found', () => {
  assertJsonCageError(() => resolveJsonPointer({ a: 1 }, '/b'), 'JSONCAGE_POINTER_NOT_FOUND');
});

test('missing nested object key is not found', () => {
  assertJsonCageError(() => resolveJsonPointer({ a: {} }, '/a/b'), 'JSONCAGE_POINTER_NOT_FOUND');
});

test('array object numeric-looking property still uses array rules', () => {
  const array = ['a'];
  array.extra = 'visible';
  assertJsonCageError(() => resolveJsonPointer(array, '/extra'), 'JSONCAGE_POINTER_NOT_FOUND');
});

test('object accessor property is rejected without invoking the getter', () => {
  const document = {};
  let invoked = false;
  Object.defineProperty(document, 'x', {
    enumerable: true,
    get() {
      invoked = true;
      throw new Error('getter must not run');
    }
  });
  assertJsonCageError(() => resolveJsonPointer(document, '/x'), 'JSONCAGE_UNSUPPORTED_VALUE');
  assert.equal(invoked, false);
});

test('array accessor element is rejected without invoking the getter', () => {
  const array = [];
  let invoked = false;
  Object.defineProperty(array, '0', {
    enumerable: true,
    get() {
      invoked = true;
      throw new Error('getter must not run');
    }
  });
  assertJsonCageError(() => resolveJsonPointer(array, '/0'), 'JSONCAGE_UNSUPPORTED_VALUE');
  assert.equal(invoked, false);
});

test('array hole is not found instead of resolving to undefined', () => {
  assertJsonCageError(() => resolveJsonPointer(new Array(1), '/0'), 'JSONCAGE_POINTER_NOT_FOUND');
});

test('pointer type must be a string', () => {
  assertJsonCageError(() => resolveJsonPointer({}, 0), 'JSONCAGE_INVALID_INPUT');
  assertJsonCageError(() => resolveJsonPointer({}, null), 'JSONCAGE_INVALID_INPUT');
});

test('pointer byte limit is enforced in UTF-8 bytes', () => {
  assertJsonCageError(() => resolveJsonPointer({}, '/é', { maxPointerBytes: 2 }), 'JSONCAGE_MAX_BYTES');
  assert.equal(resolveJsonPointer({ 'é': 1 }, '/é', { maxPointerBytes: 3 }), 1);
});

test('pointer segment count limit is enforced', () => {
  assertJsonCageError(() => resolveJsonPointer({}, '/a/a', { maxPointerSegments: 1 }), 'JSONCAGE_POINTER_SYNTAX');
  assert.equal(resolveJsonPointer({ a: { a: 1 } }, '/a/a', { maxPointerSegments: 2 }), 1);
});

test('empty pointer does not count as a segment', () => {
  const document = { a: 1 };
  assert.equal(resolveJsonPointer(document, '', { maxPointerSegments: 0 }), document);
});

test('pointer segment key length limit is enforced in UTF-16 units', () => {
  assertJsonCageError(() => resolveJsonPointer({}, '/aaaa', { maxKeyLength: 3 }), 'JSONCAGE_MAX_KEY_LENGTH');
  assert.equal(resolveJsonPointer({ aaaa: 1 }, '/aaaa', { maxKeyLength: 4 }), 1);
});

test('pointer path context identifies the unsuccessful segment path', () => {
  const error = assertJsonCageError(() => resolveJsonPointer({ a: {} }, '/a/missing'), 'JSONCAGE_POINTER_NOT_FOUND');
  assert.equal(error.key, 'missing');
});

test('deep valid pointer resolves within segment cap', () => {
  let document = {};
  let cursor = document;
  const segments = [];
  for (let index = 0; index < 32; index += 1) {
    cursor.a = {};
    cursor = cursor.a;
    segments.push('a');
  }
  cursor.value = 7;
  segments.push('value');
  assert.equal(resolveJsonPointer(document, '/' + segments.join('/'), { maxPointerSegments: 33 }), 7);
});

test('lone surrogate in pointer segment is rejected', () => {
  assertJsonCageError(
    () => resolveJsonPointer({}, '/' + String.fromCharCode(0xd800)),
    'JSONCAGE_LONE_SURROGATE'
  );
});

test('valid astral character in pointer segment is accepted', () => {
  assert.equal(resolveJsonPointer({ '😀': 6 }, '/😀'), 6);
});

test('invalid tilde error position is the offset within the original pointer', () => {
  const error = assertJsonCageError(() => resolveJsonPointer({}, '/abc~x'), 'JSONCAGE_POINTER_SYNTAX');
  assert.equal(error.position, 4);
});

