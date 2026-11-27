import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSafeJson } from '../src/index.mjs';
import { assertJsonCageError, assertJsonEqual, nestedArray, nestedObject } from './helpers.mjs';

const validDocuments = [
  ['null', null],
  ['true', true],
  ['false', false],
  ['0', 0],
  ['-0', -0],
  ['1', 1],
  ['-1', -1],
  ['0.5', 0.5],
  ['-0.5', -0.5],
  ['1e2', 100],
  ['1E2', 100],
  ['1e+2', 100],
  ['1e-2', 0.01],
  ['""', ''],
  ['"ascii"', 'ascii'],
  ['"snowman ☃"', 'snowman ☃'],
  ['"emoji 😀"', 'emoji 😀'],
  ['"\\u0041"', 'A'],
  ['"\\u0061\\u0062\\u0063"', 'abc'],
  ['"\\uD83D\\uDE00"', '😀'],
  ['"\\/\\\\\\"\\b\\f\\n\\r\\t"', '/\\"\b\f\n\r\t'],
  ['[]', []],
  ['[null]', [null]],
  ['[true,false]', [true, false]],
  ['[1,2,3]', [1, 2, 3]],
  ['["a","b"]', ['a', 'b']],
  ['[[[]]]', [[[]]]],
  ['{}', {}],
  ['{"":""}', { '': '' }],
  ['{"a":1}', { a: 1 }],
  ['{"a":null,"b":false}', { a: null, b: false }],
  ['{"nested":{"value":[1,{"x":2}]}}', { nested: { value: [1, { x: 2 }] } }],
  ['[{"a":1},{"b":2}]', [{ a: 1 }, { b: 2 }]],
  [' { "a" : [ 1 , 2 ] } ', { a: [1, 2] }],
  ['\t{\r\n"a"\t:\r1\n}\r', { a: 1 }],
  ['"\\u0000"', '\0'],
  ['"\\u001f"', '\x1f'],
  ['"\\u007f"', '\x7f'],
  ['"\\u2028\\u2029"', '\u2028\u2029'],
  ['9007199254740991', 9007199254740991],
  ['-9007199254740991', -9007199254740991],
  ['9007199254740992', 9007199254740992],
  ['1.7976931348623157e308', 1.7976931348623157e308],
  ['5e-324', 5e-324],
  ['{"unicode":"\\u2603"}', { unicode: '☃' }],
  ['{"slash":"\\/"}', { slash: '/' }],
  ['{"emptyArray":[],"emptyObject":{}}', { emptyArray: [], emptyObject: {} }]
];

for (const [source, expected] of validDocuments) {
  test('valid RFC document ' + JSON.stringify(source).slice(0, 70), () => {
    assertJsonEqual(parseSafeJson(source), expected);
  });
}

test('parsed objects use null prototypes by default', () => {
  const value = parseSafeJson('{"a":{"b":1}}');
  assert.equal(Object.getPrototypeOf(value), null);
  assert.equal(Object.getPrototypeOf(value.a), null);
});

test('nullPrototype false returns normal objects without inherited-key collisions', () => {
  const value = parseSafeJson('{"a":{"b":1}}', { nullPrototype: false });
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(Object.getPrototypeOf(value.a), Object.prototype);
  assert.equal(Object.hasOwn(value, 'a'), true);
});

test('escaped key decoding produces equivalent decoded keys', () => {
  const value = parseSafeJson('{"\\u0061bc":1,"x\\u0079z":2}');
  assert.equal(value.abc, 1);
  assert.equal(value.xyz, 2);
});

const validNumbers = [
  '0', '-0', '1', '-1', '10', '-10', '123456789', '0.1', '0.01', '10.25',
  '-3.14159', '1e0', '1e1', '1e9', '1e+9', '1e-9', '1E0', '1E1', '1E+9', '1E-9',
  '0e0', '0e-1', '0.0e0', '-0.0e+1', '123.456e7', '123.456e-7', '-123.456E+7',
  '9007199254740991', '-9007199254740991', '1.7976931348623157e308', '2.2250738585072014e-308',
  '5e-324', '4.9406564584124654e-324', '1e308', '1e-308'
];

for (const source of validNumbers) {
  test('valid strict number ' + source, () => {
    assert.equal(parseSafeJson(source), Number(source));
  });
}

const invalidNumbers = [
  '01', '001', '-01', '+1', '+0', '.1', '-.1', '1.', '1.e1', '1e', '1e+', '1e-',
  '1E', '1E+', '1E-', '--1', '-+1', '+-1', '0x1', '0X10', '0b10', '0o17', '1_000',
  'NaN', 'nan', 'Infinity', 'infinity', '-Infinity', '+Infinity', '1..2', '1e1.2',
  '1a', '1 2', '00.1', '01e2', '-00', '0x', '1e++1', '1e--1', '1e+-1', '1e-+1'
];

for (const source of invalidNumbers) {
  test('invalid number rejected ' + JSON.stringify(source), () => {
    assertJsonCageError(() => parseSafeJson(source), 'JSONCAGE_SYNTAX_ERROR');
  });
}

const invalidDocuments = [
  '', ' ', '\t\r\n', '{', '[', '"', '{"a"', '{"a":', '{"a":1', '[1', '[[', '{{', '{{{',
  '}', ']', '{]', '[}', '{"a":1,}', '[1,]', '{,}', '[,]', '{"a",1}', '{"a" 1}', '{"a"::1}',
  '{a:1}', "{'a':1}", "'single'", 'truee', 'falsee', 'nulll', 'tru', 'fals', 'nul', 'TRUE', 'FALSE', 'NULL',
  'null null', '{} {}', '[] []', '1 1', '"a" "b"', '// comment\n{}', '/* comment */{}',
  '{"a":/* comment */1}', '[1 // comment\n]', '{"a":1}//x', '\v{}', '\f{}', '\0{}',
  '{"a":1}\v', '{"a":1}\f', '{"a":1}\0', '[1;2]', '{"a";1}', '{"a"=1}', '{"a"=>1}',
  '[1 2]', '{"a":1 "b":2}', '{"a":1,,"b":2}', '[1,,2]', '{"a":}', '[:]', '[,1]',
  '{"a":1,,"b":2}', '[null,,null]', '{"a":[]]', '[{"a":1}}', '["unterminated', '{"key":"value"',
  '["a",]', '{"a":true,}', '["a" "b"]', '{"a" "b"}', '<{}>', 'undefined', '()', 'new',
  '\\u0041', '"ok" trailing', '[1] trailing', '{"a":1} trailing'
];

for (const source of invalidDocuments) {
  test('invalid strict syntax ' + JSON.stringify(source).slice(0, 70), () => {
    assertJsonCageError(() => parseSafeJson(source), 'JSONCAGE_SYNTAX_ERROR');
  });
}

for (let unit = 0; unit < 0x20; unit += 1) {
  test('unescaped control character rejected 0x' + unit.toString(16).padStart(2, '0'), () => {
    const source = '"a' + String.fromCharCode(unit) + 'b"';
    assertJsonCageError(() => parseSafeJson(source), 'JSONCAGE_SYNTAX_ERROR');
  });
}

const invalidEscapes = [
  '"\\"', '"\\x"', '"\\v"', '"\\0"', '"\\a"', '"\\e"', '"\\?"', '"\\u"', '"\\u0"', '"\\u00"',
  '"\\u000"', '"\\u000g"', '"\\u00x0"', '"\\uzzzz"', '"\\u123"', '"abc\\"', '"\\\n"',
  '"\\\r"', '"\\\t"', '"\\U0041"', '"\\u{41}"'
];

for (const source of invalidEscapes) {
  test('invalid string escape ' + JSON.stringify(source), () => {
    assertJsonCageError(() => parseSafeJson(source), 'JSONCAGE_SYNTAX_ERROR');
  });
}

const whitespace = [' ', '\t', '\r', '\n'];
for (const before of whitespace) {
  for (const after of whitespace) {
    test('legal whitespace combination ' + JSON.stringify(before + after), () => {
      assertJsonEqual(parseSafeJson(before + '{"a":1}' + after), { a: 1 });
    });
  }
}

const illegalWhitespace = ['\v', '\f', '\0', '\u00a0', '\u1680', '\u2000', '\u2028', '\u2029', '\ufeff'];
for (const character of illegalWhitespace) {
  test('illegal whitespace rejected ' + JSON.stringify(character), () => {
    assertJsonCageError(() => parseSafeJson(character + '{}'), character === '\ufeff' ? 'JSONCAGE_BOM_REJECTED' : 'JSONCAGE_SYNTAX_ERROR');
    if (character !== '\ufeff') {
      assertJsonCageError(() => parseSafeJson('{}' + character), 'JSONCAGE_SYNTAX_ERROR');
    }
  });
}

test('maximum depth boundary accepts exactly 32 nested arrays', () => {
  assertJsonEqual(parseSafeJson(nestedArray(32), { maxDepth: 32 }), JSON.parse(nestedArray(32)));
});

test('maximum depth rejects 33 nested arrays by default', () => {
  assertJsonCageError(() => parseSafeJson(nestedArray(33)), 'JSONCAGE_MAX_DEPTH');
});

test('maximum depth boundary accepts exactly 32 nested objects', () => {
  assertJsonEqual(parseSafeJson(nestedObject(32), { maxDepth: 32 }), JSON.parse(nestedObject(32)));
});

test('maximum depth rejects 33 nested objects by default', () => {
  assertJsonCageError(() => parseSafeJson(nestedObject(33)), 'JSONCAGE_MAX_DEPTH');
});

test('scalar object members do not add structural depth', () => {
  assertJsonEqual(parseSafeJson('{"a":{"b":1}}', { maxDepth: 2 }), { a: { b: 1 } });
});

test('one hundred thousand opening brackets fail by depth without RangeError', () => {
  const input = '['.repeat(100000);
  const start = performance.now();
  try {
    parseSafeJson(input);
    assert.fail('expected depth failure');
  } catch (error) {
    assert.equal(error.code, 'JSONCAGE_MAX_DEPTH');
    assert.equal(error instanceof RangeError, false);
  }
  assert.ok(performance.now() - start < 1000, 'depth failure should be fast');
});

test('one thousand nested valid arrays do not overflow the parser call stack when limit is raised', () => {
  const input = nestedArray(1000, 0);
  const value = parseSafeJson(input, { maxDepth: 1000, maxNodes: 2000 });
  assert.equal(Array.isArray(value), true);
});

test('unexpected trailing input reports syntax error position', () => {
  const error = assertJsonCageError(() => parseSafeJson('{} x'), 'JSONCAGE_SYNTAX_ERROR');
  assert.equal(error.position, 3);
});

test('trailing comma in object is syntax error', () => {
  assertJsonCageError(() => parseSafeJson('{"a":1,}'), 'JSONCAGE_SYNTAX_ERROR');
});

test('trailing comma in array is syntax error', () => {
  assertJsonCageError(() => parseSafeJson('[1,]'), 'JSONCAGE_SYNTAX_ERROR');
});

test('comment-like input is syntax error', () => {
  assertJsonCageError(() => parseSafeJson('{"a":1//x\n}'), 'JSONCAGE_SYNTAX_ERROR');
});
