import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esm from '../src/index.mjs';

const require = createRequire(import.meta.url);
const cjs = require('../dist/index.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const expectedExports = [
  'JSONCAGE_ERROR_CODES',
  'CODE',
  'JsonCageError',
  'parseSafeJson',
  'parseSafeJsonBytes',
  'createJsonCage',
  'resolveJsonPointer',
  'applySafeMergePatch',
  'canonicalizeJson',
  'stringifySafeJson',
  'inspectJsonPayload'
].sort();

test('ESM and CommonJS expose the same named API', () => {
  const esmNames = Object.keys(esm).filter((name) => name !== 'default').sort();
  const cjsNames = Object.keys(cjs).filter((name) => name !== 'default').sort();
  assert.deepEqual(esmNames, expectedExports);
  assert.deepEqual(cjsNames, expectedExports);
});

test('ESM default export contains the named API', () => {
  for (const name of expectedExports) assert.equal(typeof esm.default[name], typeof esm[name]);
});

test('CommonJS default export is the module export object', () => {
  assert.equal(cjs.default, cjs);
});

test('JsonCageError class has the same name and behavior in both modules', () => {
  for (const mod of [esm, cjs]) {
    const error = new mod.JsonCageError('X', 'reason', { position: 1 });
    assert.equal(error.name, 'JsonCageError');
    assert.equal(error.code, 'X');
    assert.equal(error.reason, 'reason');
    assert.equal(error.position, 1);
  }
});

const parityCases = [
  ['valid parse', (mod) => mod.canonicalizeJson(mod.parseSafeJson('{"a":[1,true]}')), '{"a":[1,true]}'],
  ['duplicate rejection', (mod) => {
    try { mod.parseSafeJson('{"a":1,"\\u0061":2}'); return 'no-error'; } catch (error) { return error.code; }
  }, 'JSONCAGE_DUPLICATE_KEY'],
  ['prototype rejection', (mod) => {
    try { mod.parseSafeJson('{"__proto__":1}'); return 'no-error'; } catch (error) { return error.code; }
  }, 'JSONCAGE_PROTOTYPE_KEY'],
  ['depth rejection', (mod) => {
    try { mod.parseSafeJson('['.repeat(40)); return 'no-error'; } catch (error) { return error.code; }
  }, 'JSONCAGE_MAX_DEPTH'],
  ['invalid utf8 rejection', (mod) => {
    try { mod.parseSafeJsonBytes(new Uint8Array([0xff])); return 'no-error'; } catch (error) { return error.code; }
  }, 'JSONCAGE_INVALID_UTF8'],
  ['inspection', (mod) => mod.inspectJsonPayload('{"a":1,"a":2}').findings[0].code, 'JSONCAGE_DUPLICATE_KEY'],
  ['pointer', (mod) => mod.resolveJsonPointer({ a: [{ b: 2 }] }, '/a/0/b'), 2],
  ['merge patch', (mod) => mod.canonicalizeJson(mod.applySafeMergePatch({ a: 1, b: 2 }, { a: null })), '{"b":2}'],
  ['canonicalization', (mod) => mod.canonicalizeJson({ b: 1, a: 2 }), '{"a":2,"b":1}'],
  ['safe stringify', (mod) => mod.stringifySafeJson({ b: 1, a: 2 }), '{"b":1,"a":2}']
];

for (const [label, run, expected] of parityCases) {
  test('ESM behavior parity: ' + label, () => {
    assert.equal(run(esm), expected);
  });
  test('CommonJS behavior parity: ' + label, () => {
    assert.equal(run(cjs), expected);
  });
}

test('parsed object prototypes match across module formats', () => {
  for (const mod of [esm, cjs]) {
    assert.equal(Object.getPrototypeOf(mod.parseSafeJson('{"a":1}')), null);
  }
});

test('createJsonCage instance defaults apply in both module formats', () => {
  for (const mod of [esm, cjs]) {
    const cage = mod.createJsonCage({ maxDepth: 2 });
    assert.equal(cage.options.maxDepth, 2);
    try {
      cage.parse('[[[]]]');
      assert.fail('expected depth failure');
    } catch (error) {
      assert.equal(error.code, 'JSONCAGE_MAX_DEPTH');
    }
  }
});

test('createJsonCage per-call overrides apply in both module formats', () => {
  for (const mod of [esm, cjs]) {
    const cage = mod.createJsonCage({ maxDepth: 2 });
    assert.equal(Array.isArray(cage.parse('[[[]]]', { maxDepth: 3 })), true);
  }
});

const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

test('package metadata has required name version and license', () => {
  assert.equal(packageJson.name, 'jsoncage');
  assert.equal(packageJson.version, '1.0.0');
  assert.equal(packageJson.license, 'MIT');
});

test('package has zero runtime and development dependencies', () => {
  assert.deepEqual(packageJson.dependencies, {});
  assert.deepEqual(packageJson.devDependencies, {});
});

test('package requires Node 18 or newer', () => {
  assert.equal(packageJson.engines.node, '>=18.0.0');
});

test('package repository homepage and bugs metadata match public repository slug', () => {
  assert.equal(packageJson.repository.url, 'git+https://github.com/draarivpatel-ui/jsoncage.git');
  assert.equal(packageJson.homepage, 'https://github.com/draarivpatel-ui/jsoncage#readme');
  assert.equal(packageJson.bugs.url, 'https://github.com/draarivpatel-ui/jsoncage/issues');
});

test('package export map points to types ESM and generated CommonJS', () => {
  assert.equal(packageJson.exports['.'].types, './types/index.d.ts');
  assert.equal(packageJson.exports['.'].import, './src/index.mjs');
  assert.equal(packageJson.exports['.'].require, './dist/index.cjs');
  assert.equal(packageJson.main, './dist/index.cjs');
  assert.equal(packageJson.module, './src/index.mjs');
  assert.equal(packageJson.types, './types/index.d.ts');
});

test('CLI bin entry has no leading dot slash and points to executable file', () => {
  assert.equal(packageJson.bin.jsoncage, 'bin/jsoncage.mjs');
  assert.equal(packageJson.bin.jsoncage.startsWith('./'), false);
  const bin = readFileSync(path.join(root, packageJson.bin.jsoncage), 'utf8');
  assert.equal(bin.startsWith('#!/usr/bin/env node'), true);
});

test('package files list includes runtime types bin docs and community files', () => {
  for (const entry of ['src', 'dist', 'types', 'bin', 'docs', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'LICENSE']) {
    assert.equal(packageJson.files.includes(entry), true, entry);
  }
});

test('test script uses Node built-in discovery portable to Windows and Node 18', () => {
  assert.equal(packageJson.scripts.test, 'node --test');
});

test('module is marked side-effect free', () => {
  assert.equal(packageJson.sideEffects, false);
});

for (const file of [
  'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE', '.gitattributes', '.gitignore',
  '.github/workflows/ci.yml', '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.md', '.github/ISSUE_TEMPLATE/feature_request.md',
  'docs/GOOD_FIRST_ISSUES.md', 'types/index.d.ts', 'scripts/build-cjs.mjs', 'scripts/cli-smoke.mjs'
]) {
  test('required repository file exists: ' + file, () => {
    assert.equal(existsSync(path.join(root, file)), true, file);
  });
}

test('license is MIT and copyright holder is project contributors', () => {
  const license = readFileSync(path.join(root, 'LICENSE'), 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /jsoncage contributors/);
});

test('gitattributes enforces LF for source documentation and configuration text', () => {
  const attributes = readFileSync(path.join(root, '.gitattributes'), 'utf8');
  for (const extension of ['*.mjs', '*.cjs', '*.js', '*.ts', '*.json', '*.md', '*.yml']) {
    assert.match(attributes, new RegExp(extension.replace('*', '\\*') + ' text eol=lf'));
  }
});

test('CI matrix covers required Node versions and operating systems', () => {
  const ci = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  for (const version of [18, 20, 22, 24]) assert.match(ci, new RegExp('\\b' + version + '\\b'));
  assert.match(ci, /ubuntu-24\.04/);
  assert.match(ci, /windows-latest/);
  assert.match(ci, /npm test/);
  assert.match(ci, /build-cjs\.mjs --check/);
  assert.match(ci, /cli-smoke\.mjs/);
  assert.match(ci, /npm pack --dry-run/);
});

test('good first issues document contains ten numbered starter specifications', () => {
  const doc = readFileSync(path.join(root, 'docs/GOOD_FIRST_ISSUES.md'), 'utf8');
  for (let index = 1; index <= 10; index += 1) {
    assert.match(doc, new RegExp('^' + index + '\\. \\*\\*', 'm'));
  }
});

test('README explains threat model duplicate keys prototypes depth and numeric differentials', () => {
  const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
  for (const phrase of [
    'Duplicate-key smuggling',
    'Prototype pollution',
    'Stack-overflow denial of service',
    'Parser and numeric differentials',
    'Finding and error codes'
  ]) {
    assert.match(readme, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('README does not claim npm installation is already available', () => {
  const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.equal(readme.includes('npm install jsoncage'), false);
  assert.match(readme, /does not claim\s+that a release has already been published/);
});

test('type declarations expose every runtime export', () => {
  const types = readFileSync(path.join(root, 'types/index.d.ts'), 'utf8');
  for (const name of expectedExports) {
    if (name === 'JsonCageError') assert.match(types, /export class JsonCageError/);
    else if (name === 'JSONCAGE_ERROR_CODES' || name === 'CODE') assert.match(types, new RegExp('export const ' + name));
    else assert.match(types, new RegExp('export function ' + name));
  }
  assert.match(types, /export default jsoncage/);
});

function walk(directory) {
  const output = [];
  for (const entry of readdirSync(directory)) {
    if (entry === '.git' || entry === 'node_modules') continue;
    const full = path.join(directory, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) output.push(...walk(full));
    else if (stat.isFile()) output.push(full);
  }
  return output;
}

const textExtensions = new Set(['.mjs', '.cjs', '.js', '.ts', '.json', '.md', '.yml']);
const textBasenames = new Set(['LICENSE', '.gitattributes', '.gitignore']);
const repositoryFiles = walk(root).filter((file) => textExtensions.has(path.extname(file)) || textBasenames.has(path.basename(file)));

test('repository text inventory covers source tests docs and metadata', () => {
  assert.ok(repositoryFiles.length >= 20, 'expected at least 20 text files');
  for (const required of ['src/index.mjs', 'dist/index.cjs', 'README.md', 'types/index.d.ts']) {
    assert.equal(repositoryFiles.includes(path.join(root, required)), true, required);
  }
});

test('all repository text files use LF rather than CRLF', () => {
  for (const file of repositoryFiles) {
    const bytes = readFileSync(file);
    assert.equal(bytes.includes(0x0d), false, 'CR byte in ' + path.basename(file));
  }
});

test('all repository text files avoid em and en dash punctuation characters', () => {
  for (const file of repositoryFiles) {
    const text = readFileSync(file, 'utf8');
    for (const character of text) {
      const unit = character.codePointAt(0);
      assert.notEqual(unit, 0x2014, 'em dash in ' + file);
      assert.notEqual(unit, 0x2013, 'en dash in ' + file);
    }
  }
});

test('repository text files do not contain local absolute home paths or direct email addresses', () => {
  for (const file of repositoryFiles) {
    const text = readFileSync(file, 'utf8');
    assert.equal(text.includes('/User' + 's/'), false, file);
    assert.equal(text.includes('/ho' + 'me/'), false, file);
    assert.equal(text.includes('@gmail' + '.com'), false, file);
    assert.equal(text.includes('@users.noreply.github' + '.com'), false, file);
  }
});

test('node_modules is absent from the repository checkout', () => {
  assert.equal(existsSync(path.join(root, 'node_modules')), false);
});

test('generated CommonJS artifact is present and marked generated', () => {
  const artifact = readFileSync(path.join(root, 'dist/index.cjs'), 'utf8');
  assert.match(artifact, /Generated by scripts\/build-cjs\.mjs/);
  assert.match(artifact, /module\.exports/);
});
