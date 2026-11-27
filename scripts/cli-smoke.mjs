import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'jsoncage.mjs');
const scratch = mkdtempSync(path.join(tmpdir(), 'jsoncage-smoke-'));

function run(args, input) {
  return spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: 'utf8',
    timeout: 10000
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const safeFile = path.join(scratch, 'safe.json');
  writeFileSync(safeFile, '{"z":1,"a":[true,null]}', 'utf8');

  const safe = run(['check', safeFile, '--json']);
  assert(safe.status === 0, 'safe file did not exit 0: ' + safe.stderr);
  assert(JSON.parse(safe.stdout).ok === true, 'safe file did not report ok');

  const unsafe = run(['check', '-'], '{"a":1,"\\u0061":2}');
  assert(unsafe.status === 1, 'duplicate-key input did not exit 1');
  assert(unsafe.stdout.includes('JSONCAGE_DUPLICATE_KEY'), 'duplicate code missing');

  const canonical = run(['canonicalize', safeFile]);
  assert(canonical.status === 0, 'canonicalize did not exit 0: ' + canonical.stderr);
  assert(canonical.stdout.trim() === '{"a":[true,null],"z":1}', 'canonical output mismatch');

  const usage = run(['check']);
  assert(usage.status === 2, 'usage failure did not exit 2');

  process.stdout.write('CLI smoke test passed\n');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
