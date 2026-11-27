import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSafeJson,
  inspectJsonPayload,
  JSONCAGE_ERROR_CODES
} from '../src/index.mjs';
import {
  assertJsonCageError,
  assertJsonEqual,
  codesFrom,
  objectWithKeys,
  arrayWithItems
} from './helpers.mjs';

const duplicatePayloads = [
  '{"a":1,"a":2}',
  '{"a":1,"\\u0061":2}',
  '{"\\u0061":1,"a":2}',
  '{"role":"user","ro\\u006ce":"admin"}',
  '{"x":1,"\\u0078":2,"\\u0058":3}',
  '{"outer":{"a":1,"a":2}}',
  '{"outer":{"a":1,"\\u0061":2}}',
  '[{"a":1,"a":2}]',
  '[{"a":1,"\\u0061":2}]',
  '{"outer":[{"inner":{"a":1,"a":2}}]}',
  '{"\\u0061":1,"\\u0061":2}',
  '{"ab":1,"a\\u0062":2}',
  '{"a\\u0062":1,"ab":2}',
  '{"a":1,"\\u0041":2,"a":3}',
  '{"k":"first","\\u006b":"second"}',
  '{"nested":{"\\u0072ole":"user","role":"admin"}}',
  '{"a":{"b":1},"a":{"c":2}}',
  '{"a":[],"a":{}}',
  '{"a":null,"a":false}',
  '{"a":0,"a":-0}',
  '{"\\uD83D\\uDE00":1,"😀":2}'
];

for (const source of duplicatePayloads) {
  test('duplicate key rejected ' + source.slice(0, 60), () => {
    assertJsonCageError(() => parseSafeJson(source), 'JSONCAGE_DUPLICATE_KEY');
  });
}

test('same key in sibling objects is not a duplicate', () => {
  assertJsonEqual(parseSafeJson('[{"a":1},{"a":2}]'), [{ a: 1 }, { a: 2 }]);
});

test('same key in nested different objects is not a duplicate', () => {
  assertJsonEqual(parseSafeJson('{"a":{"a":1}}'), { a: { a: 1 } });
});

test('same key in array container objects is frame-local', () => {
  assertJsonEqual(parseSafeJson('{"x":[{"a":1},{"a":2}]}'), { x: [{ a: 1 }, { a: 2 }] });
});

test('duplicate policy first keeps the first value when explicitly enabled', () => {
  const value = parseSafeJson('{"a":1,"\\u0061":2}', { duplicateKeys: 'first' });
  assert.equal(value.a, 1);
});

test('duplicate policy last keeps the last value when explicitly enabled', () => {
  const value = parseSafeJson('{"a":1,"\\u0061":2}', { duplicateKeys: 'last' });
  assert.equal(value.a, 2);
});

test('duplicate policy first applies recursively', () => {
  const value = parseSafeJson('{"o":{"a":1,"\\u0061":2}}', { duplicateKeys: 'first' });
  assert.equal(value.o.a, 1);
});

test('duplicate policy last applies recursively', () => {
  const value = parseSafeJson('{"o":{"a":1,"\\u0061":2}}', { duplicateKeys: 'last' });
  assert.equal(value.o.a, 2);
});

test('duplicate reject is the default and never silent', () => {
  assertJsonCageError(() => parseSafeJson('{"a":1,"a":2}'), 'JSONCAGE_DUPLICATE_KEY');
});

test('inspect counts repeated duplicate occurrences', () => {
  const report = inspectJsonPayload('{"a":1,"a":2,"a":3}');
  assert.equal(report.stats.duplicateKeysFound, 2);
  assert.equal(report.findings.filter((finding) => finding.code === 'JSONCAGE_DUPLICATE_KEY').length, 2);
});

test('explicit first and last still count duplicates in inspection statistics', () => {
  for (const duplicateKeys of ['first', 'last']) {
    const report = inspectJsonPayload('{"a":1,"a":2}', { duplicateKeys });
    assert.equal(report.ok, true);
    assert.equal(report.stats.duplicateKeysFound, 1);
  }
});

const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
const dangerousContexts = [
  (key) => '{"' + key + '":1}',
  (key) => '{"safe":{"' + key + '":1}}',
  (key) => '[{"' + key + '":1}]',
  (key) => '{"safe":[{"deep":{"' + key + '":1}}]}'
];

function escapedKey(key) {
  return [...key].map((character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')).join('');
}

for (const key of dangerousKeys) {
  for (const makeContext of dangerousContexts) {
    test('dangerous key rejected directly: ' + key, () => {
      assertJsonCageError(() => parseSafeJson(makeContext(key)), 'JSONCAGE_PROTOTYPE_KEY');
    });
    test('dangerous key rejected after Unicode decoding: ' + key, () => {
      assertJsonCageError(() => parseSafeJson(makeContext(escapedKey(key))), 'JSONCAGE_PROTOTYPE_KEY');
    });
  }
}

test('unicode escaped __proto__ spelling is decoded before rejection', () => {
  assertJsonCageError(
    () => parseSafeJson('{"\\u005f\\u005fproto\\u005f\\u005f":{"polluted":true}}'),
    'JSONCAGE_PROTOTYPE_KEY'
  );
});

test('prototype pollution rejection happens before object prototype mutation', () => {
  const before = Object.prototype.polluted;
  assertJsonCageError(() => parseSafeJson('{"__proto__":{"polluted":true}}'), 'JSONCAGE_PROTOTYPE_KEY');
  assert.equal(Object.prototype.polluted, before);
  assert.equal({}.polluted, undefined);
});

test('protoPolicy strip removes dangerous keys when explicitly enabled', () => {
  const value = parseSafeJson('{"safe":1,"__proto__":{"x":2},"constructor":3,"prototype":4}', { protoPolicy: 'strip' });
  assert.equal(value.safe, 1);
  assert.equal(Object.hasOwn(value, '__proto__'), false);
  assert.equal(Object.hasOwn(value, 'constructor'), false);
  assert.equal(Object.hasOwn(value, 'prototype'), false);
});

test('protoPolicy strip applies recursively', () => {
  const value = parseSafeJson('{"outer":{"safe":1,"constructor":2}}', { protoPolicy: 'strip' });
  assert.equal(value.outer.safe, 1);
  assert.equal(Object.hasOwn(value.outer, 'constructor'), false);
});

test('inspection counts dangerous keys even when strip is enabled', () => {
  const report = inspectJsonPayload('{"__proto__":1,"constructor":2,"prototype":3}', { protoPolicy: 'strip' });
  assert.equal(report.ok, true);
  assert.equal(report.stats.dangerousKeysFound, 3);
});

test('inspection collects multiple dangerous key findings in reject mode', () => {
  const report = inspectJsonPayload('{"__proto__":1,"constructor":2}');
  assert.equal(report.ok, false);
  assert.deepEqual(codesFrom(report), ['JSONCAGE_PROTOTYPE_KEY', 'JSONCAGE_PROTOTYPE_KEY']);
});

test('dangerous keys do not pollute null-prototype parse output in strip mode', () => {
  const value = parseSafeJson('{"__proto__":{"polluted":true},"safe":1}', { protoPolicy: 'strip' });
  assert.equal({}.polluted, undefined);
  assert.equal(value.safe, 1);
});

test('byte limit accepts exact ASCII size', () => {
  assert.equal(parseSafeJson('null', { maxBytes: 4 }), null);
});

test('byte limit rejects ASCII payload one byte over', () => {
  assertJsonCageError(() => parseSafeJson('null', { maxBytes: 3 }), 'JSONCAGE_MAX_BYTES');
});

test('byte limit measures UTF-8 rather than UTF-16 units', () => {
  const source = '"é"';
  assert.equal(new TextEncoder().encode(source).length, 4);
  assert.equal(parseSafeJson(source, { maxBytes: 4 }), 'é');
  assertJsonCageError(() => parseSafeJson(source, { maxBytes: 3 }), 'JSONCAGE_MAX_BYTES');
});

test('byte limit measures astral characters as four UTF-8 bytes', () => {
  const source = '"😀"';
  assert.equal(new TextEncoder().encode(source).length, 6);
  assert.equal(parseSafeJson(source, { maxBytes: 6 }), '😀');
  assertJsonCageError(() => parseSafeJson(source, { maxBytes: 5 }), 'JSONCAGE_MAX_BYTES');
});

test('byte limit is checked before syntax parsing', () => {
  assertJsonCageError(() => parseSafeJson('not json at all', { maxBytes: 3 }), 'JSONCAGE_MAX_BYTES');
});

test('object key count accepts exact boundary', () => {
  const source = objectWithKeys(1000);
  const value = parseSafeJson(source, { maxKeys: 1000, maxNodes: 2000 });
  assert.equal(Object.keys(value).length, 1000);
});

test('object key count rejects one over boundary', () => {
  assertJsonCageError(() => parseSafeJson(objectWithKeys(1001), { maxKeys: 1000, maxNodes: 2000 }), 'JSONCAGE_MAX_KEYS');
});

test('object key count is enforced per object rather than globally', () => {
  const source = '[{' + '"a":0,"b":1' + '},{' + '"a":0,"b":1' + '}]';
  assertJsonEqual(parseSafeJson(source, { maxKeys: 2 }), [{ a: 0, b: 1 }, { a: 0, b: 1 }]);
});

test('array length accepts exact boundary', () => {
  const value = parseSafeJson(arrayWithItems(10000), { maxArrayLength: 10000, maxNodes: 20000 });
  assert.equal(value.length, 10000);
});

test('array length rejects one over boundary', () => {
  assertJsonCageError(() => parseSafeJson(arrayWithItems(10001), { maxArrayLength: 10000, maxNodes: 20000 }), 'JSONCAGE_MAX_ARRAY_LENGTH');
});

test('array length is enforced per array rather than globally', () => {
  assertJsonEqual(parseSafeJson('[[0,1],[0,1]]', { maxArrayLength: 2 }), [[0, 1], [0, 1]]);
});

test('node count accepts exact boundary for array and elements', () => {
  assertJsonEqual(parseSafeJson('[1,2,3]', { maxNodes: 4 }), [1, 2, 3]);
});

test('node count rejects one over boundary', () => {
  assertJsonCageError(() => parseSafeJson('[1,2,3]', { maxNodes: 3 }), 'JSONCAGE_MAX_NODES');
});

test('node count includes object containers and member values', () => {
  assertJsonCageError(() => parseSafeJson('{"a":1,"b":2}', { maxNodes: 2 }), 'JSONCAGE_MAX_NODES');
  assertJsonEqual(parseSafeJson('{"a":1,"b":2}', { maxNodes: 3 }), { a: 1, b: 2 });
});

test('string length accepts exact decoded boundary', () => {
  assert.equal(parseSafeJson('"aaaa"', { maxStringLength: 4 }), 'aaaa');
});

test('string length rejects one decoded unit over boundary', () => {
  assertJsonCageError(() => parseSafeJson('"aaaaa"', { maxStringLength: 4 }), 'JSONCAGE_MAX_STRING_LENGTH');
});

test('string length counts decoded Unicode escapes rather than source escape length', () => {
  assert.equal(parseSafeJson('"\\u0061\\u0062"', { maxStringLength: 2 }), 'ab');
  assertJsonCageError(() => parseSafeJson('"\\u0061\\u0062\\u0063"', { maxStringLength: 2 }), 'JSONCAGE_MAX_STRING_LENGTH');
});

test('astral pairs count as two UTF-16 units for string length', () => {
  assert.equal(parseSafeJson('"\\uD83D\\uDE00"', { maxStringLength: 2 }), '😀');
  assertJsonCageError(() => parseSafeJson('"\\uD83D\\uDE00"', { maxStringLength: 1 }), 'JSONCAGE_MAX_STRING_LENGTH');
});

test('key length accepts exact boundary', () => {
  assertJsonEqual(parseSafeJson('{"aaaa":1}', { maxKeyLength: 4 }), { aaaa: 1 });
});

test('key length rejects one over boundary', () => {
  assertJsonCageError(() => parseSafeJson('{"aaaaa":1}', { maxKeyLength: 4 }), 'JSONCAGE_MAX_KEY_LENGTH');
});

test('key length counts decoded Unicode escapes', () => {
  assertJsonEqual(parseSafeJson('{"\\u0061\\u0062":1}', { maxKeyLength: 2 }), { ab: 1 });
  assertJsonCageError(() => parseSafeJson('{"\\u0061\\u0062\\u0063":1}', { maxKeyLength: 2 }), 'JSONCAGE_MAX_KEY_LENGTH');
});

test('number overflow rejects positive infinity by default', () => {
  assertJsonCageError(() => parseSafeJson('1e400'), 'JSONCAGE_NUMBER_OVERFLOW');
});

test('number overflow rejects negative infinity by default', () => {
  assertJsonCageError(() => parseSafeJson('-1e400'), 'JSONCAGE_NUMBER_OVERFLOW');
});

test('number overflow can be explicitly relaxed', () => {
  assert.equal(parseSafeJson('1e400', { rejectNumberOverflow: false }), Infinity);
});

test('positive nonzero number underflowing to zero is rejected by default', () => {
  assertJsonCageError(() => parseSafeJson('1e-400'), 'JSONCAGE_NUMBER_OVERFLOW');
});

test('negative nonzero number underflowing to zero is rejected by default', () => {
  assertJsonCageError(() => parseSafeJson('-1e-400'), 'JSONCAGE_NUMBER_OVERFLOW');
});

test('nonzero mantissa with a huge negative exponent is rejected before numeric evaluation loss', () => {
  assertJsonCageError(() => parseSafeJson('0.0001e999999999999999999999999', { rejectNumberOverflow: true }), 'JSONCAGE_NUMBER_OVERFLOW');
  assertJsonCageError(() => parseSafeJson('0.0001e-999999999999999999999999'), 'JSONCAGE_NUMBER_OVERFLOW');
});

test('exact zero with a huge negative exponent remains valid JSON', () => {
  assert.equal(parseSafeJson('0e-999999999999999999999999'), 0);
  assert.equal(Object.is(parseSafeJson('-0e-999999999999999999999999'), -0), true);
});

test('number underflow can be explicitly relaxed', () => {
  assert.equal(parseSafeJson('1e-400', { rejectNumberOverflow: false }), 0);
});

test('minimum positive subnormal remains accepted', () => {
  assert.equal(parseSafeJson('5e-324'), 5e-324);
});

test('largest finite double is accepted', () => {
  assert.equal(parseSafeJson('1.7976931348623157e308'), 1.7976931348623157e308);
});

test('unsafe positive integer is accepted by default but counted in inspection', () => {
  assert.equal(parseSafeJson('9007199254740993'), 9007199254740992);
  const report = inspectJsonPayload('9007199254740993');
  assert.equal(report.ok, true);
  assert.equal(report.stats.unsafeIntegersFound, 1);
});

test('unsafe negative integer is counted in inspection', () => {
  const report = inspectJsonPayload('-9007199254740993');
  assert.equal(report.stats.unsafeIntegersFound, 1);
});

test('unsafe integer is rejected when explicitly enabled', () => {
  assertJsonCageError(() => parseSafeJson('9007199254740993', { rejectUnsafeIntegers: true }), 'JSONCAGE_UNSAFE_INTEGER');
});

test('integral fraction and exponent spellings are rejected in strict integer mode', () => {
  for (const source of ['9007199254740992.0', '9.007199254740993e15', '-9007199254740992.0']) {
    assertJsonCageError(() => parseSafeJson(source, { rejectUnsafeIntegers: true }), 'JSONCAGE_UNSAFE_INTEGER');
  }
});

test('maximum safe integer is accepted in strict integer mode', () => {
  assert.equal(parseSafeJson('9007199254740991', { rejectUnsafeIntegers: true }), 9007199254740991);
  assert.equal(parseSafeJson('-9007199254740991', { rejectUnsafeIntegers: true }), -9007199254740991);
});

test('large integral exponent values count as unsafe integers', () => {
  const report = inspectJsonPayload('1e20');
  assert.equal(report.stats.unsafeIntegersFound, 1);
});

const escapedSurrogates = [
  '"\\uD800"', '"\\uDBFF"', '"\\uDC00"', '"\\uDFFF"', '"\\uD800x"',
  '"\\uD800\\u0041"', '"\\uD800\\uD800"', '"\\uDC00\\uD800"',
  '"x\\uD800"', '"x\\uDC00"', '{"\\uD800":1}', '{"\\uDC00":1}'
];

for (const source of escapedSurrogates) {
  test('lone escaped surrogate rejected ' + source, () => {
    assertJsonCageError(() => parseSafeJson(source), 'JSONCAGE_LONE_SURROGATE');
  });
}

for (const unit of [0xd800, 0xdbff, 0xdc00, 0xdfff]) {
  test('raw lone surrogate rejected 0x' + unit.toString(16), () => {
    const source = '"' + String.fromCharCode(unit) + '"';
    assertJsonCageError(() => parseSafeJson(source), 'JSONCAGE_LONE_SURROGATE');
  });
}

const validAstralPairs = [
  ['"\\uD83D\\uDE00"', '😀'],
  ['"\\uD83C\\uDF0D"', '🌍'],
  ['"\\uD834\\uDD1E"', '𝄞'],
  ['"\\uD800\\uDC00"', '𐀀'],
  ['"\\uDBFF\\uDFFF"', '􏿿']
];

for (const [source, expected] of validAstralPairs) {
  test('valid escaped astral pair accepted ' + source, () => {
    assert.equal(parseSafeJson(source), expected);
  });
}

test('raw astral pair is accepted', () => {
  assert.equal(parseSafeJson('"😀"'), '😀');
});

test('multiple valid astral pairs are accepted', () => {
  assert.equal(parseSafeJson('"\\uD83D\\uDE00\\uD83C\\uDF0D"'), '😀🌍');
});

test('mixed raw high and escaped low surrogate form is rejected conservatively', () => {
  const source = '"' + String.fromCharCode(0xd83d) + '\\uDE00"';
  assertJsonCageError(() => parseSafeJson(source), 'JSONCAGE_LONE_SURROGATE');
});

test('lone surrogates are counted during inspection', () => {
  const report = inspectJsonPayload('["\\uD800","\\uDC00"]');
  assert.equal(report.ok, false);
  assert.equal(report.stats.loneSurrogatesFound, 2);
  assert.deepEqual(codesFrom(report), ['JSONCAGE_LONE_SURROGATE', 'JSONCAGE_LONE_SURROGATE']);
});

test('string BOM is rejected by default', () => {
  assertJsonCageError(() => parseSafeJson('\ufeff{}'), 'JSONCAGE_BOM_REJECTED');
});

test('string BOM can be explicitly allowed', () => {
  assertJsonEqual(parseSafeJson('\ufeff{}', { rejectBom: false }), {});
});

test('BOM after whitespace is not treated as a skippable BOM', () => {
  assertJsonCageError(() => parseSafeJson(' \ufeff{}', { rejectBom: false }), 'JSONCAGE_SYNTAX_ERROR');
});

test('NUL in key is rejected by default', () => {
  assertJsonCageError(() => parseSafeJson('{"\\u0000":1}'), 'JSONCAGE_NUL_REJECTED');
});

test('NUL in key can be explicitly accepted', () => {
  const value = parseSafeJson('{"\\u0000":1}', { rejectNulKeys: false });
  assert.equal(value['\0'], 1);
});

test('NUL inside key rather than only empty key is rejected', () => {
  assertJsonCageError(() => parseSafeJson('{"a\\u0000b":1}'), 'JSONCAGE_NUL_REJECTED');
});

test('NUL in string value is accepted by default', () => {
  assert.equal(parseSafeJson('"a\\u0000b"'), 'a\0b');
});

test('NUL in string value is rejected when enabled', () => {
  assertJsonCageError(() => parseSafeJson('"a\\u0000b"', { rejectNulStrings: true }), 'JSONCAGE_NUL_REJECTED');
});

test('inspection reports byte count and structural statistics', () => {
  const report = inspectJsonPayload('{"a":[1,"é"]}');
  assert.equal(report.ok, true);
  assert.equal(report.stats.bytes, new TextEncoder().encode('{"a":[1,"é"]}').length);
  assert.equal(report.stats.maxDepthObserved, 2);
  assert.equal(report.stats.totalNodes, 4);
  assert.equal(report.stats.duplicateKeysFound, 0);
  assert.equal(report.stats.dangerousKeysFound, 0);
});

test('inspection preserves recoverable findings before a later fatal syntax error', () => {
  const report = inspectJsonPayload('{"a":1,"\\u0061":2,}');
  assert.equal(report.ok, false);
  assert.deepEqual(codesFrom(report), ['JSONCAGE_DUPLICATE_KEY', 'JSONCAGE_SYNTAX_ERROR']);
});

test('inspection returns invalid input as a finding rather than throwing payload type errors', () => {
  const report = inspectJsonPayload(42);
  assert.equal(report.ok, false);
  assert.deepEqual(codesFrom(report), ['JSONCAGE_INVALID_INPUT']);
});

test('error object exposes stable code and JSON representation', () => {
  const error = assertJsonCageError(() => parseSafeJson('{"a":1,"a":2}'), 'JSONCAGE_DUPLICATE_KEY');
  assert.equal(error.name, 'JsonCageError');
  assert.equal(error.key, 'a');
  assert.equal(error.toJSON().code, 'JSONCAGE_DUPLICATE_KEY');
});

test('error object does not embed the full payload', () => {
  const secretish = 'x'.repeat(200);
  const error = assertJsonCageError(() => parseSafeJson('{"a":"' + secretish + '","a":2}'), 'JSONCAGE_DUPLICATE_KEY');
  assert.equal(JSON.stringify(error).includes(secretish), false);
});

const invalidOptionCases = [
  [{ unknown: true }, 'unknown option'],
  [{ maxBytes: 0 }, 'maxBytes'],
  [{ maxOutputBytes: 0 }, 'maxOutputBytes'],
  [{ maxDepth: 0 }, 'maxDepth'],
  [{ maxKeys: 0 }, 'maxKeys'],
  [{ maxArrayLength: 0 }, 'maxArrayLength'],
  [{ maxNodes: 0 }, 'maxNodes'],
  [{ maxStringLength: -1 }, 'maxStringLength'],
  [{ maxKeyLength: -1 }, 'maxKeyLength'],
  [{ maxBytes: 1.5 }, 'maxBytes'],
  [{ maxDepth: Number.MAX_SAFE_INTEGER + 1 }, 'maxDepth'],
  [{ duplicateKeys: 'silent' }, 'duplicateKeys'],
  [{ protoPolicy: 'allow' }, 'protoPolicy'],
  [{ nullPrototype: 'yes' }, 'nullPrototype'],
  [{ rejectBom: 1 }, 'rejectBom'],
  [null, null],
  [[], 'array options']
];

for (const [options, label] of invalidOptionCases) {
  test('invalid options rejected: ' + label, () => {
    if (label === null) assert.equal(parseSafeJson('null', null), null);
    else assertJsonCageError(() => parseSafeJson('null', options), 'JSONCAGE_INVALID_OPTIONS');
  });
}

test('all documented error codes are frozen strings', () => {
  assert.equal(Object.isFrozen(JSONCAGE_ERROR_CODES), true);
  for (const [name, code] of Object.entries(JSONCAGE_ERROR_CODES)) {
    assert.equal(typeof code, 'string');
    assert.ok(code.startsWith('JSONCAGE_'), name);
  }
});
