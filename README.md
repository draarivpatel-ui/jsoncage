# jsoncage

`jsoncage` is a zero-dependency Node.js security library for strict JSON parsing,
inspection, canonicalization, JSON Pointer resolution, and JSON Merge Patch.
It implements RFC 8259 syntax with I-JSON oriented interoperability checks and
fail-closed resource limits.

The package is prepared for npm publication but this repository does not claim
that a release has already been published.

## Why `JSON.parse()` is not enough

`JSON.parse()` is a correct general-purpose parser for trusted input, but it is
not a security boundary for attacker-controlled payloads.

### Duplicate-key smuggling

RFC 8259 says object names ought to be unique, but it does not require every
implementation to reject duplicates. JavaScript keeps the last value:

```js
JSON.parse('{"role":"user","role":"admin"}').role
// "admin"
```

Escape-equivalent keys are worse. These two spellings decode to the same key:

```json
{"role":"user","ro\u006ce":"admin"}
```

Different proxies, validators, application servers, and databases can choose
different duplicate-key behavior. An attacker can use that differential to make
one layer validate `user` while another layer executes or stores `admin`.
`jsoncage` decodes keys before comparison and rejects duplicates at every
nesting level by default.

### Prototype pollution

JavaScript objects inherit from `Object.prototype` unless created otherwise.
Keys such as `__proto__`, `constructor`, and `prototype` are security sensitive
when merged, assigned, or resolved through inherited properties. `jsoncage`
rejects those keys after Unicode escape decoding and creates parsed objects with
`Object.create(null)` by default.

### Stack-overflow denial of service

A recursive descent parser can consume the JavaScript call stack before it has
a chance to enforce a logical depth limit. `jsoncage` uses an explicit heap
stack rather than recursive JavaScript parser calls. Input such as one hundred
thousand opening brackets fails with `JSONCAGE_MAX_DEPTH` at the configured
limit instead of `RangeError: Maximum call stack size exceeded`.

### Parser and numeric differentials

JSON numbers have arbitrary mathematical precision in the grammar, but most
languages map them to finite binary or decimal types. Integers above
`Number.MAX_SAFE_INTEGER` can round in JavaScript while remaining exact in
another language or database. Very large exponents can become `Infinity` in a
JavaScript consumer while being rejected elsewhere, and very small nonzero
values can collapse to zero. `jsoncage` rejects finite range overflow and
nonzero underflow to zero by default, and can reject unsafe integers with
`rejectUnsafeIntegers: true`.

### Unicode and encoding confusion

Lone UTF-16 surrogates, UTF-8 byte order marks, malformed UTF-8, NUL characters
in keys, and non-standard JSON extensions are frequent sources of parser
differentials. `jsoncage` rejects them fail-closed according to the options
below.

## Install and module formats

The source of truth is ESM in `src/index.mjs`. The generated CommonJS build is
`dist/index.cjs`, and hand-authored types are in `types/index.d.ts`. Both module
formats are exported by `package.json` and have parity tests.

```js
import {
  parseSafeJson,
  inspectJsonPayload,
  canonicalizeJson
} from 'jsoncage';
```

```js
const {
  parseSafeJson,
  inspectJsonPayload,
  canonicalizeJson
} = require('jsoncage');
```

For local development before publication, use a relative or file-based module
specifier rather than the package name shown above.

## Quick start

```js
import { parseSafeJson, inspectJsonPayload } from 'jsoncage';

const value = parseSafeJson('{"user":{"roles":["editor"]}}');
// Objects are null-prototype objects by default.

const report = inspectJsonPayload('{"a":1,"\\u0061":2}');
if (!report.ok) {
  console.error(report.findings);
}
```

`inspectJsonPayload` does not throw for malformed or unsafe payload bytes. It
returns stable finding codes and resource statistics. Invalid library options
still throw because they are programmer errors rather than payload data.

## API

### `parseSafeJson(input, options?)`

Parses a JavaScript string containing one strict JSON value. Throws
`JsonCageError` on the first violation. The input size is measured in UTF-8
bytes even though the input is a string.

### `parseSafeJsonBytes(bytes, options?)`

Accepts a `Uint8Array`, `ArrayBuffer`, or another ArrayBuffer view. Bytes are
decoded with `TextDecoder('utf-8', { fatal: true, ignoreBOM: true })`. Invalid
UTF-8, overlong encodings, and encoded UTF-16 surrogate sequences fail with
`JSONCAGE_INVALID_UTF8`. A leading byte order mark is rejected by default with
`JSONCAGE_BOM_REJECTED`.

### `createJsonCage(defaultOptions?)`

Creates a frozen instance with reusable defaults:

```js
import { createJsonCage } from 'jsoncage';

const cage = createJsonCage({
  maxBytes: 16384,
  maxDepth: 8,
  rejectUnsafeIntegers: true
});

const payload = cage.parse('{"id":9007199254740991}');
const report = cage.inspect('{"id":9007199254740993}');
```

Methods are `parse`, `parseBytes`, `inspect`, `resolvePointer`,
`applyMergePatch`, `canonicalize`, and `stringify`. Per-call options override
instance defaults.

### `inspectJsonPayload(input, options?)`

Returns:

```js
{
  ok: false,
  findings: [
    {
      code: 'JSONCAGE_DUPLICATE_KEY',
      message: 'duplicate object key after Unicode escape decoding',
      position: 7,
      key: 'a'
    }
  ],
  stats: {
    bytes: 18,
    maxDepthObserved: 1,
    totalNodes: 3,
    duplicateKeysFound: 1,
    dangerousKeysFound: 0,
    unsafeIntegersFound: 0,
    loneSurrogatesFound: 0
  }
}
```

Recoverable policy violations such as duplicate keys can be collected while the
audit continues. Fatal syntax and resource violations end the audit at the
first unrecoverable point. Explicitly opting into `duplicateKeys: 'first'` or
`'last'` accepts those duplicates for parsing, but the statistics still count
them.

### `resolveJsonPointer(document, pointer, options?)`

Resolves an RFC 6901 JSON Pointer.

```js
import { resolveJsonPointer } from 'jsoncage';

resolveJsonPointer({ 'a/b': [{ '~key': 1 }] }, '/a~1b/0/~0key');
// 1
```

Security behavior:

- `~0` and `~1` are the only accepted tilde escapes.
- `__proto__`, `constructor`, and `prototype` segments are rejected.
- Object segments must exist as own properties through `Object.hasOwn`.
- Accessor properties are rejected without invoking their getters.
- Inherited properties such as `toString` and `valueOf` can never be read.
- Array indexes must be canonical non-negative decimal integers.
- Leading zeros, negative indexes, the JSON Patch append token `-`, and
  out-of-range indexes are rejected.
- Lone UTF-16 surrogates in pointer segments are rejected.
- Pointer byte and segment count limits are enforced before traversal.

### `applySafeMergePatch(target, patch, options?)`

Applies an RFC 7396 JSON Merge Patch without mutating either input.

```js
import { applySafeMergePatch } from 'jsoncage';

const target = { a: { keep: 1, remove: 2 } };
const patch = { a: { remove: null, added: 3 } };
const result = applySafeMergePatch(target, patch);
// result: { a: { keep: 1, added: 3 } }
// target and patch are unchanged
```

Security behavior:

- The output is freshly allocated and object outputs have null prototypes.
- Prototype pollution keys are rejected by default and stripped only with
  `protoPolicy: 'strip'`.
- Arrays are replacement values, as required by RFC 7396.
- Depth, key-count, array-length, string-length, and total-node limits are enforced.
- Cyclic object graphs, accessors, class instances, unsupported values,
  non-enumerable or symbol-keyed data, extra array properties, non-finite
  numbers, and lone surrogates fail closed.
- The algorithm uses explicit work stacks rather than recursive JavaScript
  calls.

### `canonicalizeJson(value, options?)`

Serializes strict JSON with object keys sorted by UTF-16 code unit order. The
output is deterministic for equivalent data and is suitable as input to a
hashing or signing pipeline. This is inspired by RFC 8785, but callers should
treat it as jsoncage canonical JSON rather than claiming formal RFC 8785
conformance without an external conformance suite.

### `stringifySafeJson(value, options?)`

Serializes strict JSON while preserving object key enumeration order. Both
serializers reject unsupported values instead of silently dropping object
properties or converting `undefined`, `NaN`, or `Infinity` to JSON values.
Cycles, lone surrogates, accessors, class instances, non-enumerable or
symbol-keyed data, extra array properties, excess depth, excess node count,
excess string length, excess output bytes, and non-finite numbers fail closed.

## Options

| Option | Default | Meaning |
| --- | ---: | --- |
| `maxBytes` | `1048576` | Maximum input size in UTF-8 bytes |
| `maxOutputBytes` | `1048576` | Maximum serialized output size in UTF-8 bytes |
| `maxDepth` | `32` | Maximum nested array or object depth; scalar values do not add structural depth |
| `maxKeys` | `1000` | Maximum keys in one object |
| `maxArrayLength` | `10000` | Maximum elements in one array |
| `maxNodes` | `50000` | Maximum total JSON values |
| `maxStringLength` | `65536` | Maximum parsed or serialized string length in UTF-16 code units |
| `maxKeyLength` | `256` | Maximum object key length in UTF-16 code units |
| `duplicateKeys` | `'reject'` | `'reject'`, or explicit opt-in to `'first'` or `'last'` |
| `protoPolicy` | `'reject'` | `'reject'` or explicit opt-in to `'strip'` |
| `nullPrototype` | `true` | Use null-prototype objects for parsed objects |
| `rejectBom` | `true` | Reject a leading Unicode byte order mark |
| `rejectNulKeys` | `true` | Reject NUL characters in object keys |
| `rejectNulStrings` | `false` | Reject NUL characters in string values |
| `rejectUnsafeIntegers` | `false` | Reject integers outside the exact safe integer range |
| `rejectNumberOverflow` | `true` | Reject numeric literals that overflow to non-finite numbers or nonzero literals that underflow to zero |
| `maxPointerBytes` | `4096` | Maximum JSON Pointer byte length |
| `maxPointerSegments` | `128` | Maximum JSON Pointer segment count |

Unknown option names throw `JSONCAGE_INVALID_OPTIONS`. This prevents a misspelled
security control from silently disappearing.

## Finding and error codes

| Code | Meaning |
| --- | --- |
| `JSONCAGE_DUPLICATE_KEY` | Duplicate object key after escape decoding |
| `JSONCAGE_PROTOTYPE_KEY` | `__proto__`, `constructor`, or `prototype` encountered |
| `JSONCAGE_MAX_DEPTH` | Array or object nesting depth limit exceeded |
| `JSONCAGE_MAX_BYTES` | UTF-8 input, pointer, or serialized output byte limit exceeded |
| `JSONCAGE_MAX_NODES` | Total JSON value count limit exceeded |
| `JSONCAGE_MAX_KEYS` | Object key count limit exceeded |
| `JSONCAGE_MAX_ARRAY_LENGTH` | Array length limit exceeded |
| `JSONCAGE_MAX_STRING_LENGTH` | String length limit exceeded |
| `JSONCAGE_MAX_KEY_LENGTH` | Object key length limit exceeded |
| `JSONCAGE_LONE_SURROGATE` | Unpaired UTF-16 high or low surrogate |
| `JSONCAGE_NUMBER_OVERFLOW` | Number overflows the finite IEEE-754 range, a nonzero number underflows to zero, or a non-finite number was supplied |
| `JSONCAGE_UNSAFE_INTEGER` | Integer cannot be represented exactly as a JavaScript number |
| `JSONCAGE_INVALID_UTF8` | Byte input is not well-formed UTF-8 |
| `JSONCAGE_SYNTAX_ERROR` | Input violates strict RFC 8259 syntax |
| `JSONCAGE_BOM_REJECTED` | Leading Unicode byte order mark rejected |
| `JSONCAGE_NUL_REJECTED` | NUL rejected in a key or string by policy |
| `JSONCAGE_INVALID_INPUT` | API input type is not supported |
| `JSONCAGE_INVALID_OPTIONS` | Option object is unknown or invalid |
| `JSONCAGE_POINTER_SYNTAX` | JSON Pointer syntax is invalid |
| `JSONCAGE_POINTER_NOT_FOUND` | JSON Pointer cannot be resolved through the document |
| `JSONCAGE_UNSUPPORTED_VALUE` | Value cannot be represented as strict JSON |
| `JSONCAGE_CYCLE_DETECTED` | Cyclic object graph detected |

`JsonCageError` exposes `code`, `reason`, and contextual fields such as
`position`, `key`, `path`, `limit`, `actual`, and `depth` when available. It
never includes the full payload in the error object.

## CLI

```text
jsoncage check <file-or-dash> [--max-bytes N] [--max-depth N] [--strict-integers] [--json]
jsoncage canonicalize <file-or-dash> [--strict-integers]
```

Use `-` to read standard input. File inputs must be regular files. Directories,
devices, FIFOs, and symbolic links are rejected before reading. Error output
neutralizes terminal control characters in user-controlled command arguments
and file paths. Exit codes are:

- `0`: safe input or successful canonicalization
- `1`: unsafe JSON findings or canonicalization input rejected
- `2`: usage error or I/O error

Examples:

```sh
printf '{"a":1}' | jsoncage check - --json
jsoncage canonicalize payload.json
```

## Strict rejection behavior

The parser rejects comments, trailing commas, single-quoted strings, unquoted
object keys, `NaN`, `Infinity`, hexadecimal numbers, leading plus signs,
leading zeroes, unescaped control characters, malformed Unicode escapes, lone
surrogates, and trailing input. Whitespace is limited to the four characters
allowed by RFC 8259: space, tab, carriage return, and line feed.

## Security model and boundaries

`jsoncage` protects a process that accepts JSON from an attacker or crosses a
trust boundary between parsers. It does not make an application authorization
decision safe by itself, does not validate business semantics, and does not
protect code that later copies parsed data into a normal object with unsafe
assignment or merge logic. Keep data in null-prototype objects or copy it with
safe own-key assignment.

The library is not a sandbox. Input strings and byte arrays have already been
allocated by the host process before they reach the API, so applications should
also enforce transport, request-body, memory, and time limits at their outer
boundary.

## Development

```sh
npm test
node scripts/build-cjs.mjs --check
node scripts/cli-smoke.mjs
npm pack --dry-run
```

The project has zero runtime dependencies and zero development dependencies.
Tests use only the Node.js built-in test runner. The checked-in suite currently
passes 939 tests.

## License

MIT. See `LICENSE`.
