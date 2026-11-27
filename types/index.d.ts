export type DuplicateKeyPolicy = 'reject' | 'first' | 'last';
export type PrototypeKeyPolicy = 'reject' | 'strip';

export interface JsonCageOptions {
  /** Maximum input or output size measured in UTF-8 bytes. Default 1048576. */
  maxBytes?: number;
  /** Maximum nested array or object depth. Scalar values do not add structural depth. Default 32. */
  maxDepth?: number;
  /** Maximum keys in one object. Default 1000. */
  maxKeys?: number;
  /** Maximum elements in one array. Default 10000. */
  maxArrayLength?: number;
  /** Maximum total JSON values. Default 50000. */
  maxNodes?: number;
  /** Maximum decoded string length in UTF-16 code units. Default 65536. */
  maxStringLength?: number;
  /** Maximum object key length in UTF-16 code units. Default 256. */
  maxKeyLength?: number;
  /** Duplicate object key policy. Default 'reject'. */
  duplicateKeys?: DuplicateKeyPolicy;
  /** Prototype pollution key policy. Default 'reject'. */
  protoPolicy?: PrototypeKeyPolicy;
  /** Create parsed and merged objects with a null prototype. Default true. */
  nullPrototype?: boolean;
  /** Reject a leading Unicode byte order mark. Default true. */
  rejectBom?: boolean;
  /** Reject NUL characters in object keys. Default true. */
  rejectNulKeys?: boolean;
  /** Reject NUL characters in string values. Default false. */
  rejectNulStrings?: boolean;
  /** Reject integers outside the exact IEEE-754 safe integer range. Default false. */
  rejectUnsafeIntegers?: boolean;
  /** Reject numbers that overflow to Infinity or -Infinity. Default true. */
  rejectNumberOverflow?: boolean;
  /** Maximum JSON Pointer size in UTF-8 bytes. Default 4096. */
  maxPointerBytes?: number;
  /** Maximum number of JSON Pointer segments. Default 128. */
  maxPointerSegments?: number;
}

export interface JsonCageErrorCodes {
  DUPLICATE_KEY: 'JSONCAGE_DUPLICATE_KEY';
  PROTOTYPE_KEY: 'JSONCAGE_PROTOTYPE_KEY';
  MAX_DEPTH: 'JSONCAGE_MAX_DEPTH';
  MAX_BYTES: 'JSONCAGE_MAX_BYTES';
  MAX_NODES: 'JSONCAGE_MAX_NODES';
  MAX_KEYS: 'JSONCAGE_MAX_KEYS';
  MAX_ARRAY_LENGTH: 'JSONCAGE_MAX_ARRAY_LENGTH';
  MAX_STRING_LENGTH: 'JSONCAGE_MAX_STRING_LENGTH';
  MAX_KEY_LENGTH: 'JSONCAGE_MAX_KEY_LENGTH';
  LONE_SURROGATE: 'JSONCAGE_LONE_SURROGATE';
  NUMBER_OVERFLOW: 'JSONCAGE_NUMBER_OVERFLOW';
  UNSAFE_INTEGER: 'JSONCAGE_UNSAFE_INTEGER';
  INVALID_UTF8: 'JSONCAGE_INVALID_UTF8';
  SYNTAX_ERROR: 'JSONCAGE_SYNTAX_ERROR';
  BOM_REJECTED: 'JSONCAGE_BOM_REJECTED';
  NUL_REJECTED: 'JSONCAGE_NUL_REJECTED';
  INVALID_INPUT: 'JSONCAGE_INVALID_INPUT';
  INVALID_OPTIONS: 'JSONCAGE_INVALID_OPTIONS';
  POINTER_SYNTAX: 'JSONCAGE_POINTER_SYNTAX';
  POINTER_NOT_FOUND: 'JSONCAGE_POINTER_NOT_FOUND';
  UNSUPPORTED_VALUE: 'JSONCAGE_UNSUPPORTED_VALUE';
  CYCLE_DETECTED: 'JSONCAGE_CYCLE_DETECTED';
}

export const JSONCAGE_ERROR_CODES: Readonly<JsonCageErrorCodes>;
export const CODE: Readonly<JsonCageErrorCodes>;

export class JsonCageError extends Error {
  constructor(code: string, message: string, details?: Record<string, unknown>);
  code: string;
  reason: string;
  position?: number;
  path?: string;
  key?: string;
  limit?: number;
  actual?: number;
  depth?: number;
  toJSON(): Record<string, unknown>;
}

export interface JsonCageFinding {
  code: string;
  message: string;
  position?: number;
  path?: string;
  key?: string;
  limit?: number;
  actual?: number;
  depth?: number;
}

export interface JsonCageStats {
  bytes: number;
  maxDepthObserved: number;
  totalNodes: number;
  duplicateKeysFound: number;
  dangerousKeysFound: number;
  unsafeIntegersFound: number;
  loneSurrogatesFound: number;
}

export interface JsonCageInspection {
  ok: boolean;
  findings: JsonCageFinding[];
  stats: JsonCageStats;
}

export type JsonCageByteInput = Uint8Array | ArrayBuffer | SharedArrayBuffer | ArrayBufferView;

export function parseSafeJson<T = unknown>(input: string, options?: JsonCageOptions): T;
export function parseSafeJsonBytes<T = unknown>(input: JsonCageByteInput, options?: JsonCageOptions): T;
export function inspectJsonPayload(input: string | JsonCageByteInput, options?: JsonCageOptions): JsonCageInspection;
export function resolveJsonPointer<T = unknown>(document: unknown, pointer: string, options?: JsonCageOptions): T;
export function applySafeMergePatch<T = unknown>(target: unknown, patch: unknown, options?: JsonCageOptions): T;
export function canonicalizeJson(value: unknown, options?: JsonCageOptions): string;
export function stringifySafeJson(value: unknown, options?: JsonCageOptions): string;

export interface JsonCageInstance {
  readonly options: Readonly<Required<JsonCageOptions>>;
  parse<T = unknown>(input: string, options?: JsonCageOptions): T;
  parseBytes<T = unknown>(input: JsonCageByteInput, options?: JsonCageOptions): T;
  inspect(input: string | JsonCageByteInput, options?: JsonCageOptions): JsonCageInspection;
  resolvePointer<T = unknown>(document: unknown, pointer: string, options?: JsonCageOptions): T;
  applyMergePatch<T = unknown>(target: unknown, patch: unknown, options?: JsonCageOptions): T;
  canonicalize(value: unknown, options?: JsonCageOptions): string;
  stringify(value: unknown, options?: JsonCageOptions): string;
}

export function createJsonCage(defaultOptions?: JsonCageOptions): JsonCageInstance;

declare const jsoncage: {
  JSONCAGE_ERROR_CODES: Readonly<JsonCageErrorCodes>;
  CODE: Readonly<JsonCageErrorCodes>;
  JsonCageError: typeof JsonCageError;
  parseSafeJson: typeof parseSafeJson;
  parseSafeJsonBytes: typeof parseSafeJsonBytes;
  createJsonCage: typeof createJsonCage;
  resolveJsonPointer: typeof resolveJsonPointer;
  applySafeMergePatch: typeof applySafeMergePatch;
  canonicalizeJson: typeof canonicalizeJson;
  stringifySafeJson: typeof stringifySafeJson;
  inspectJsonPayload: typeof inspectJsonPayload;
};

export default jsoncage;
