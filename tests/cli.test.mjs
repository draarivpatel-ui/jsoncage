import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'jsoncage.mjs');
const scratch = mkdtempSync(path.join(tmpdir(), 'jsoncage-cli-test-'));

test.after(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function run(args, input) {
  return spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: 'utf8',
    timeout: 10000
  });
}

function fixture(name, content) {
  const file = path.join(scratch, name);
  writeFileSync(file, content);
  return file;
}

test('help exits zero and prints usage', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /jsoncage check/);
});

test('no arguments exits 2 with usage', () => {
  const result = run([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});

test('unknown command exits 2', () => {
  const result = run(['wat']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown command/);
});

test('missing input path exits 2', () => {
  const result = run(['check']);
  assert.equal(result.status, 2);
});

test('unknown option exits 2', () => {
  const result = run(['check', '-', '--wat'], '{}');
  assert.equal(result.status, 2);
});

test('missing max-bytes value exits 2', () => {
  const result = run(['check', '-', '--max-bytes'], '{}');
  assert.equal(result.status, 2);
});

test('non-numeric max-bytes value exits 2', () => {
  const result = run(['check', '-', '--max-bytes', 'x'], '{}');
  assert.equal(result.status, 2);
});

test('zero max-bytes value exits 2', () => {
  const result = run(['check', '-', '--max-bytes', '0'], '{}');
  assert.equal(result.status, 2);
});

test('zero max-depth value exits 2', () => {
  const result = run(['check', '-', '--max-depth=0'], '{}');
  assert.equal(result.status, 2);
});

test('--json with canonicalize exits 2', () => {
  const result = run(['canonicalize', '-', '--json'], '{}');
  assert.equal(result.status, 2);
});

test('check valid stdin exits zero with human SAFE output', () => {
  const result = run(['check', '-'], '{"a":1}');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^SAFE /);
});

test('check valid stdin JSON output is machine readable', () => {
  const result = run(['check', '-', '--json'], '{"a":1}');
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
  assert.equal(report.stats.bytes, 7);
});

test('check valid regular file exits zero', () => {
  const file = fixture('valid.json', '{"file":true}');
  const result = run(['check', file]);
  assert.equal(result.status, 0);
});

test('check duplicate key stdin exits one and prints stable code', () => {
  const result = run(['check', '-'], '{"a":1,"\\u0061":2}');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /UNSAFE/);
  assert.match(result.stdout, /JSONCAGE_DUPLICATE_KEY/);
});

test('check duplicate key JSON output includes finding and stats', () => {
  const result = run(['check', '-', '--json'], '{"a":1,"a":2}');
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].code, 'JSONCAGE_DUPLICATE_KEY');
  assert.equal(report.stats.duplicateKeysFound, 1);
});

test('check prototype key exits one', () => {
  const result = run(['check', '-'], '{"__proto__":1}');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /JSONCAGE_PROTOTYPE_KEY/);
});

test('check malformed JSON exits one rather than two', () => {
  const result = run(['check', '-'], '{');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /JSONCAGE_SYNTAX_ERROR/);
});

test('check empty file exits one with syntax finding', () => {
  const file = fixture('empty.json', '');
  const result = run(['check', file]);
  assert.equal(result.status, 1);
});

test('check invalid UTF-8 stdin exits one', () => {
  const result = spawnSync(process.execPath, [cli, 'check', '-', '--json'], {
    input: Buffer.from([0xff]),
    encoding: 'utf8',
    timeout: 10000
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).findings[0].code, 'JSONCAGE_INVALID_UTF8');
});

test('check UTF-8 BOM stdin exits one', () => {
  const result = spawnSync(process.execPath, [cli, 'check', '-', '--json'], {
    input: Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]),
    encoding: 'utf8',
    timeout: 10000
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).findings[0].code, 'JSONCAGE_BOM_REJECTED');
});

test('check stdin over max-bytes exits one', () => {
  const result = run(['check', '-', '--max-bytes', '3', '--json'], 'null');
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).findings[0].code, 'JSONCAGE_MAX_BYTES');
});

test('check regular file over max-bytes exits one without reading it as safe', () => {
  const file = fixture('oversized.json', 'null');
  const result = run(['check', file, '--max-bytes=3']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /JSONCAGE_MAX_BYTES/);
});

test('check deep input exits one by default', () => {
  const deep = '['.repeat(40) + '0' + ']'.repeat(40);
  const result = run(['check', '-', '--json'], deep);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).findings[0].code, 'JSONCAGE_MAX_DEPTH');
});

test('check max-depth option raises accepted depth', () => {
  const deep = '['.repeat(40) + '0' + ']'.repeat(40);
  const result = run(['check', '-', '--max-depth', '40'], deep);
  assert.equal(result.status, 0);
});

test('check unsafe integer exits zero without strict integer mode', () => {
  const result = run(['check', '-', '--json'], '9007199254740993');
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).stats.unsafeIntegersFound, 1);
});

test('check unsafe integer exits one in strict integer mode', () => {
  const result = run(['check', '-', '--strict-integers', '--json'], '9007199254740993');
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).findings[0].code, 'JSONCAGE_UNSAFE_INTEGER');
});

test('canonicalize stdin sorts object keys', () => {
  const result = run(['canonicalize', '-'], '{"b":1,"a":2}');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{"a":2,"b":1}\n');
});

test('canonicalize regular file sorts nested keys', () => {
  const file = fixture('canonical.json', '{"z":{"y":1,"x":2},"a":3}');
  const result = run(['canonicalize', file]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{"a":3,"z":{"x":2,"y":1}}\n');
});

test('canonicalize duplicate input exits one', () => {
  const result = run(['canonicalize', '-'], '{"a":1,"a":2}');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /JSONCAGE_DUPLICATE_KEY/);
});

test('canonicalize malformed input exits one', () => {
  const result = run(['canonicalize', '-'], '{');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /JSONCAGE_SYNTAX_ERROR/);
});

test('canonicalize unsafe integer succeeds without strict mode', () => {
  const result = run(['canonicalize', '-'], '9007199254740993');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '9007199254740992\n');
});

test('canonicalize unsafe integer fails with strict mode', () => {
  const result = run(['canonicalize', '-', '--strict-integers'], '9007199254740993');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /JSONCAGE_UNSAFE_INTEGER/);
});

test('nonexistent input file exits two', () => {
  const result = run(['check', path.join(scratch, 'missing.json')]);
  assert.equal(result.status, 2);
});

test('directory input exits two', () => {
  const directory = path.join(scratch, 'directory-input');
  mkdirSync(directory, { recursive: true });
  const result = run(['check', directory]);
  assert.equal(result.status, 2);
});

if (process.platform !== 'win32') {
  test('symbolic link input exits two on POSIX', () => {
    const target = fixture('symlink-target.json', '{}');
    const link = path.join(scratch, 'symlink-input.json');
    symlinkSync(target, link);
    const result = run(['check', link]);
    assert.equal(result.status, 2);
  });
} else {
  test('regular file input remains portable on Windows', () => {
    const file = fixture('windows-regular.json', '{}');
    assert.equal(run(['check', file]).status, 0);
  });
}

test('CLI executable has a shebang and executable mode where mode bits are available', () => {
  if (process.platform === 'win32') {
    assert.equal(statSync(cli).isFile(), true);
  } else {
    assert.notEqual(statSync(cli).mode & 0o111, 0);
  }
});

test('--max-depth with canonicalize exits 2 because it is check-only', () => {
  const result = run(['canonicalize', '-', '--max-depth', '4'], '{}');
  assert.equal(result.status, 2);
});

test('--max-bytes with canonicalize exits 2 because it is check-only', () => {
  const result = run(['canonicalize', '-', '--max-bytes=4'], '{}');
  assert.equal(result.status, 2);
});

