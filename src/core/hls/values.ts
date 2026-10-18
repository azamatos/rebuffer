// Small parsers for the value types of RFC 8216 §4.2.

const DECIMAL_INTEGER = /^\d+$/;
const DECIMAL_FLOAT = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
const SIGNED_DECIMAL_FLOAT = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const BYTE_RANGE = /^(\d+)(?:@(\d+))?$/;

export function parseDecimalInteger(text: string): number | undefined {
  return DECIMAL_INTEGER.test(text) ? Number(text) : undefined;
}

export function parseDecimalFloat(text: string, signed = false): number | undefined {
  return (signed ? SIGNED_DECIMAL_FLOAT : DECIMAL_FLOAT).test(text) ? Number(text) : undefined;
}

/** Parses `<length>[@<offset>]`, as in EXT-X-BYTERANGE and the BYTERANGE attributes. */
export function parseByteRange(text: string): { length: number; offset?: number } | undefined {
  const match = BYTE_RANGE.exec(text.trim());
  if (match === null) return undefined;
  const [, length = "", offset] = match;
  return offset === undefined
    ? { length: Number(length) }
    : { length: Number(length), offset: Number(offset) };
}

/** Splits a comma-separated list such as CODECS or CHARACTERISTICS, dropping empty entries. */
export function splitList(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/** Rounds away floating-point noise from sums of durations (6.006 + 6.006 + …). */
export function roundSeconds(seconds: number): number {
  return Math.round(seconds * 1e6) / 1e6;
}
