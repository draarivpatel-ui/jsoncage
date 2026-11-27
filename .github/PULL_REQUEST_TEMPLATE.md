## Summary

<!-- Describe the security or correctness change and why it is needed. -->

## Verification

- [ ] `npm test`
- [ ] `node scripts/build-cjs.mjs --check`
- [ ] `node scripts/cli-smoke.mjs`
- [ ] `npm pack --dry-run`
- [ ] New security behavior has negative and positive tests
- [ ] ESM and CommonJS parity is preserved

## Risk

<!-- Note compatibility impact, attacker-controlled inputs affected, and any
behavior that is intentionally stricter than before. -->
