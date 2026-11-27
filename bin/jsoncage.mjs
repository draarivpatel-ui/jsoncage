#!/usr/bin/env node

import fs from 'node:fs';
import {
  JSONCAGE_ERROR_CODES,
  JsonCageError,
  inspectJsonPayload,
  parseSafeJsonBytes,
  canonicalizeJson
} from '../src/index.mjs';

function usage() {
  return [
    'Usage:',
    '  jsoncage check <file-or-dash> [--max-bytes N] [--max-depth N] [--strict-integers] [--json]',
    '  jsoncage canonicalize <file-or-dash> [--strict-integers]',
    '',
    'Exit codes: 0 safe, 1 unsafe JSON findings, 2 usage or I/O error.'
  ].join('\n');
}

class CliIoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliIoError';
  }
}

function printableConsoleText(value) {
  const text = String(value);
  let output = '';
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (
      unit < 0x20 ||
      unit === 0x7f ||
      (unit >= 0x80 && unit <= 0x9f) ||
      unit === 0x2028 ||
      unit === 0x2029
    ) {
      output += '\\u' + unit.toString(16).padStart(4, '0');
    } else {
      output += text[index];
    }
  }
  return output;
}

function writeStderrLine(message) {
  process.stderr.write(printableConsoleText(message) + '\n');
}

function parsePositiveInteger(value, flag) {
  if (!/^[0-9]+$/.test(value)) throw new CliIoError(flag + ' requires a non-negative integer');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > 4294967295) {
    throw new CliIoError(flag + ' is outside the supported integer range');
  }
  return number;
}

function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  if (argv.length === 0) throw new CliIoError('missing command');
  const command = argv[0];
  if (command !== 'check' && command !== 'canonicalize') {
    throw new CliIoError('unknown command: ' + command);
  }
  if (argv.length < 2) throw new CliIoError(command + ' requires a file path or -');
  const input = argv[1];
  const options = {};
  let json = false;

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      if (command !== 'check') throw new CliIoError('--json is only valid with check');
      json = true;
    } else if (argument === '--strict-integers') {
      options.rejectUnsafeIntegers = true;
    } else if (argument === '--max-bytes' || argument === '--max-depth') {
      if (command !== 'check') throw new CliIoError(argument + ' is only valid with check');
      if (index + 1 >= argv.length) throw new CliIoError(argument + ' requires a value');
      const value = parsePositiveInteger(argv[index + 1], argument);
      index += 1;
      if (argument === '--max-bytes') options.maxBytes = value;
      else options.maxDepth = value;
    } else if (argument.startsWith('--max-bytes=')) {
      if (command !== 'check') throw new CliIoError('--max-bytes is only valid with check');
      options.maxBytes = parsePositiveInteger(argument.slice('--max-bytes='.length), '--max-bytes');
    } else if (argument.startsWith('--max-depth=')) {
      if (command !== 'check') throw new CliIoError('--max-depth is only valid with check');
      options.maxDepth = parsePositiveInteger(argument.slice('--max-depth='.length), '--max-depth');
    } else {
      throw new CliIoError('unknown argument: ' + argument);
    }
  }

  if (options.maxBytes === 0) throw new CliIoError('--max-bytes must be at least 1');
  if (options.maxDepth === 0) throw new CliIoError('--max-depth must be at least 1');
  return { command, input, options, json };
}

function readStream(fd, maximumBytes) {
  const chunks = [];
  const scratch = Buffer.allocUnsafe(Math.min(65536, maximumBytes + 1));
  let total = 0;
  while (true) {
    let count;
    try {
      count = fs.readSync(fd, scratch, 0, scratch.length, null);
    } catch (error) {
      throw new CliIoError('failed to read input: ' + error.message);
    }
    if (count === 0) break;
    total += count;
    chunks.push(Buffer.from(scratch.subarray(0, count)));
    if (total > maximumBytes) break;
  }
  return Buffer.concat(chunks, total);
}

function readRegularFile(path, maximumBytes) {
  let stat;
  try {
    stat = fs.lstatSync(path);
  } catch (error) {
    throw new CliIoError('cannot stat input file: ' + error.message);
  }
  if (!stat.isFile()) {
    throw new CliIoError('input must be a regular file, not a directory, device, FIFO, or symbolic link');
  }

  let fd;
  try {
    fd = fs.openSync(path, 'r');
  } catch (error) {
    throw new CliIoError('cannot open input file: ' + error.message);
  }

  try {
    const openStat = fs.fstatSync(fd);
    if (!openStat.isFile()) {
      throw new CliIoError('input must be a regular file, not a directory, device, FIFO, or symbolic link');
    }
    if (openStat.size > maximumBytes) {
      throw new JsonCageError(JSONCAGE_ERROR_CODES.MAX_BYTES, 'input file exceeds --max-bytes', {
        limit: maximumBytes,
        actual: openStat.size
      });
    }
    return readStream(fd, maximumBytes);
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // The input has already been read or rejected. Close errors do not alter the result.
    }
  }
}

function readInput(input, options) {
  const maximumBytes = options.maxBytes === undefined ? 1048576 : options.maxBytes;
  if (input === '-') return readStream(0, maximumBytes);
  return readRegularFile(input, maximumBytes);
}

function formatFinding(finding) {
  const position = finding.position === undefined ? '' : ' at byte-independent character offset ' + finding.position;
  const key = finding.key === undefined ? '' : ' key ' + JSON.stringify(finding.key);
  return printableConsoleText(finding.code + position + key + ': ' + finding.message);
}

function runCheck(input, options, jsonOutput) {
  const bytes = readInput(input, options);
  const report = inspectJsonPayload(bytes, options);
  if (jsonOutput) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else if (report.ok) {
    process.stdout.write(
      'SAFE bytes=' + report.stats.bytes +
      ' depth=' + report.stats.maxDepthObserved +
      ' nodes=' + report.stats.totalNodes + '\n'
    );
  } else {
    process.stdout.write('UNSAFE\n');
    for (const finding of report.findings) process.stdout.write(formatFinding(finding) + '\n');
    process.stdout.write(
      'stats bytes=' + report.stats.bytes +
      ' depth=' + report.stats.maxDepthObserved +
      ' nodes=' + report.stats.totalNodes +
      ' duplicateKeys=' + report.stats.duplicateKeysFound +
      ' dangerousKeys=' + report.stats.dangerousKeysFound +
      ' unsafeIntegers=' + report.stats.unsafeIntegersFound +
      ' loneSurrogates=' + report.stats.loneSurrogatesFound + '\n'
    );
  }
  return report.ok ? 0 : 1;
}

function runCanonicalize(input, options) {
  const bytes = readInput(input, options);
  try {
    const value = parseSafeJsonBytes(bytes, options);
    process.stdout.write(canonicalizeJson(value, options) + '\n');
    return 0;
  } catch (error) {
    if (error instanceof JsonCageError) {
      writeStderrLine(error.message);
      return 1;
    }
    throw error;
  }
}

function main() {
  let parsed;
  try {
    parsed = parseArguments(process.argv.slice(2));
  } catch (error) {
    writeStderrLine(error.message);
    process.stderr.write(usage() + '\n');
    return 2;
  }
  if (parsed.help) {
    process.stdout.write(usage() + '\n');
    return 0;
  }

  try {
    if (parsed.command === 'check') return runCheck(parsed.input, parsed.options, parsed.json);
    return runCanonicalize(parsed.input, parsed.options);
  } catch (error) {
    if (error instanceof JsonCageError) {
      writeStderrLine(error.message);
      return 1;
    }
    if (error instanceof CliIoError) {
      writeStderrLine(error.message);
      return 2;
    }
    writeStderrLine('unexpected error: ' + error.message);
    return 2;
  }
}

process.exitCode = main();
