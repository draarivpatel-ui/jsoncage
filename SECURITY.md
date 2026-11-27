# Security policy

## Supported versions

Only the latest published minor version is supported once public releases begin.
Before the first public release, the `main` branch is the supported line.

| Version | Supported |
| --- | --- |
| 1.0.x | Yes, after publication |
| earlier development snapshots | No |

## Reporting a vulnerability

Use the private GitHub Security Advisories form: [Report a vulnerability](https://github.com/draarivpatel-ui/jsoncage/security/advisories/new). Do not open a public issue for an exploitable finding.

Include:

- the affected version and commit
- whether ESM, CommonJS, TypeScript types, or CLI behavior is affected
- a minimal payload or reproduction
- the security impact and whether duplicate keys, prototype pollution, depth,
  numeric precision, Unicode normalization, JSON Pointer, or merge patching is
  involved

Do not include secrets, cookies, private infrastructure addresses, or personal
data in a report.

We acknowledge reports within 48 hours. We aim to confirm or reject the report within 7 days, release a fix as soon as practical, and coordinate public disclosure with the reporter. Unless a shorter deadline is required by an actively exploited issue, please allow up to 90 days for a coordinated fix and disclosure.

## Scope

In scope:

- duplicate-key acceptance or inconsistent escape-equivalent key handling
- prototype pollution through parsing, pointers, merge patch, or serialization
- recursion or stack exhaustion before configured depth limits are enforced
- bypasses of input-byte, serialized-output-byte, depth, key, array-length, string-length, or total-node caps
- malformed UTF-8 or lone-surrogate acceptance contrary to the documented policy
- JSON Pointer inherited-property reads or prototype-key traversal
- merge-patch mutation of caller-owned inputs
- silent conversion of unsupported or non-finite values during serialization
- differences between the ESM and CommonJS security behavior

Out of scope:

- semantic authorization or business-logic validation outside JSON syntax
- resources already consumed by the host before input reaches this library
- applications intentionally choosing insecure non-default compatibility modes
- denial of service requiring memory or CPU already available to the host process
- mutation performed by application code after receiving mutable output objects

## Hardening expectations

Fixes must preserve zero runtime dependencies, strict fail-closed defaults,
explicit-stack parsing, immutable-input merge behavior, dual module parity, and
compatibility with Node 18 or newer unless a security necessity requires
otherwise.
