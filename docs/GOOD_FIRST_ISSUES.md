# Good first issues

These are bounded starter specifications for new contributors. Each item should
include tests and documentation updates when behavior changes.

1. **RFC 8259 whitespace matrix**
   Add generated tests for every combination of legal whitespace around tokens
   in a small object and array. Assert that vertical tab, form feed, and NUL
   whitespace are rejected.

2. **Number grammar fuzz corpus**
   Add table-driven valid and invalid number cases covering fractions,
   exponents, signs, leading zeroes, and empty exponent digits. Assert stable
   `JSONCAGE_SYNTAX_ERROR` positions.

3. **Unicode escape matrix**
   Add tests for every simple string escape, uppercase and lowercase hex
   digits, malformed hex lengths, and escape-equivalent object keys.

4. **Pointer escaping conformance**
   Add RFC 6901 examples for `~0`, `~1`, empty keys, adjacent slashes, invalid
   tilde sequences, and inherited object properties.

5. **Merge Patch RFC examples**
   Encode the examples from RFC 7396 as tests. Assert that neither target nor
   patch is mutated and that arrays replace rather than merge.

6. **Canonical key ordering**
   Add cases with ASCII digits, uppercase letters, lowercase letters, symbols,
   and non-ASCII keys. Verify deterministic output across two independently
   constructed objects with different insertion order.

7. **CLI file type rejection**
   Extend CLI tests for directories and oversized regular files. Use temporary
   fixtures and assert exit code 2 for non-regular files.

8. **Type declaration compile fixture**
   Add a small TypeScript consumer fixture that imports every public function
   and interface. Run it in CI when a compiler is available without making the
   package depend on TypeScript at runtime.

9. **Interop corpus runner**
   Add a local corpus format for JSON parsing tests, with each case marked as
   valid or invalid. Include a small initial corpus and a runner using the
   built-in test runner.

10. **Documentation accuracy test**
    Add tests that verify every exported function and error code in
    `types/index.d.ts` also exists in the runtime exports, and every error code
    appears in the README table.
