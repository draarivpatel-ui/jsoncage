# Contributing

Thank you for helping improve `jsoncage`.

## Ground rules

- Preserve zero runtime dependencies and zero development dependencies.
- Keep Node.js 18 compatibility.
- Keep strict fail-closed defaults. Compatibility behavior must be explicit
  opt-in and documented.
- The ESM file `src/index.mjs` is the only core source of truth. Do not edit
  `dist/index.cjs` directly.
- Run `node scripts/build-cjs.mjs` after changing the core, then verify with
  `node scripts/build-cjs.mjs --check`.
- Add tests for every security-relevant behavior change. Include both positive
  and negative cases where practical.
- Do not include real secrets, credentials, private user data, or large binary
  fixtures in tests or examples.

## Verification

Before opening a pull request, run:

```sh
npm test
node scripts/build-cjs.mjs --check
node scripts/cli-smoke.mjs
npm pack --dry-run
```

The test suite must pass on Linux and Windows for supported Node versions.

## Style

- Use plain JavaScript with explicit control flow and no parser dependencies.
- Prefer iterative algorithms for attacker-controlled recursive structures.
- Throw `JsonCageError` with a stable code rather than a bare `Error`.
- Do not put payload contents in error messages. A key name or position is
  acceptable when documented and bounded.
- Keep public TypeScript types synchronized with runtime behavior.

## Security reports

Do not open a public issue for an unpatched vulnerability. Follow
`SECURITY.md`.
