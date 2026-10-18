import type { Resolution } from "./types";
import { parseDecimalFloat, parseDecimalInteger } from "./values";

/** The value types of RFC 8216 §4.2, told apart by how the value is written. */
export type AttributeType =
  | "quoted-string"
  | "hexadecimal-sequence"
  | "decimal-integer"
  | "decimal-floating-point"
  | "signed-decimal-floating-point"
  | "decimal-resolution"
  | "enumerated-string";

export interface AttributeValue {
  type: AttributeType;
  /** The value as written; quoted strings without their quotes. */
  text: string;
}

export interface AttributeList {
  /** Attributes in the order written. A repeated name keeps its first value. */
  values: Map<string, AttributeValue>;
  /** Syntax problems, one plain sentence each. */
  errors: string[];
}

const ATTRIBUTE_NAME = /^[A-Z0-9-]+$/;
const RESOLUTION = /^(\d+)x(\d+)$/;

/** Classifies an unquoted value by its form. */
export function classifyValue(text: string): AttributeType {
  if (/^0[xX][0-9a-fA-F]+$/.test(text)) return "hexadecimal-sequence";
  if (/^\d+$/.test(text)) return "decimal-integer";
  if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return "decimal-floating-point";
  if (/^-(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return "signed-decimal-floating-point";
  if (RESOLUTION.test(text)) return "decimal-resolution";
  return "enumerated-string";
}

/**
 * Parses an attribute list (RFC 8216 §4.2): `NAME=value` pairs separated by commas, where quoted
 * strings may contain commas. Tolerates spaces around names and values and stray commas; reports
 * unclosed quotes, missing values and repeated names instead of throwing.
 */
export function parseAttributeList(input: string): AttributeList {
  const values = new Map<string, AttributeValue>();
  const errors: string[] = [];
  let position = 0;

  while (position < input.length) {
    const nameEnd = findFirst(input, ["=", ","], position);
    const name = input.slice(position, nameEnd).trim();

    if (input[nameEnd] !== "=") {
      if (name !== "") errors.push(`${name} has no value.`);
      position = nameEnd + 1;
      continue;
    }

    let valueStart = nameEnd + 1;
    while (input[valueStart] === " " || input[valueStart] === "\t") valueStart += 1;

    let value: AttributeValue | undefined;
    const label = name === "" ? "An attribute" : name;
    if (input[valueStart] === '"') {
      const close = input.indexOf('"', valueStart + 1);
      if (close === -1) {
        errors.push(`${label} has no closing quote.`);
        value = { type: "quoted-string", text: input.slice(valueStart + 1) };
        position = input.length;
      } else {
        value = { type: "quoted-string", text: input.slice(valueStart + 1, close) };
        const next = findFirst(input, [","], close + 1);
        const extra = input.slice(close + 1, next).trim();
        if (extra !== "")
          errors.push(`${label} has unexpected text after its closing quote: ${extra}`);
        position = next + 1;
      }
    } else {
      const next = findFirst(input, [","], valueStart);
      const text = input.slice(valueStart, next).trim();
      if (text === "") errors.push(`${label} has an empty value.`);
      else value = { type: classifyValue(text), text };
      position = next + 1;
    }

    if (value === undefined) continue;
    if (name === "") {
      errors.push("An attribute has no name.");
      continue;
    }
    if (!ATTRIBUTE_NAME.test(name)) {
      errors.push(`"${name}" isn't a valid attribute name; names use A–Z, 0–9 and hyphens.`);
    }
    if (values.has(name)) errors.push(`${name} appears more than once; the first value is used.`);
    else values.set(name, value);
  }

  return { values, errors };
}

/** Index of the first of `chars` at or after `from`, or the input length. */
function findFirst(input: string, chars: string[], from: number): number {
  for (let index = from; index < input.length; index += 1) {
    if (chars.includes(input.charAt(index))) return index;
  }
  return input.length;
}

/**
 * Reads typed values from an attribute list for one tag. A value of the wrong type is reported
 * (through `report`) and, where the intent is clear, still used: an unquoted CODECS is read as a
 * string, a quoted RESOLUTION as a resolution, `BANDWIDTH=1e6` is dropped.
 */
export class AttributeReader {
  constructor(
    private readonly values: ReadonlyMap<string, AttributeValue>,
    private readonly report: (message: string) => void,
  ) {}

  has(name: string): boolean {
    return this.values.has(name);
  }

  /** Reports a missing required attribute; returns whether it is present. */
  require(name: string): boolean {
    if (this.values.has(name)) return true;
    this.report(`${name} is missing; it's required.`);
    return false;
  }

  /** The value as written, with its type, for attributes that accept more than one type. */
  raw(name: string): AttributeValue | undefined {
    return this.values.get(name);
  }

  /** Every attribute as written, known or not. */
  record(): Record<string, string> {
    return Object.fromEntries([...this.values].map(([name, value]) => [name, value.text]));
  }

  quoted(name: string): string | undefined {
    return this.read(name, true)?.text;
  }

  /** An enumerated string; with `allowed`, other values are reported and dropped. */
  enumerated<T extends string>(name: string, allowed?: readonly T[]): T | undefined {
    const value = this.read(name, false);
    if (value === undefined) return undefined;
    if (allowed === undefined) return value.text as T;
    const match = allowed.find((option) => option === value.text);
    if (match === undefined) {
      this.report(`${name} should be ${orList(allowed)}; found "${value.text}".`);
    }
    return match;
  }

  yesNo(name: string): boolean | undefined {
    const value = this.enumerated(name, ["YES", "NO"]);
    return value === undefined ? undefined : value === "YES";
  }

  integer(name: string): number | undefined {
    const value = this.read(name, false);
    if (value === undefined) return undefined;
    const parsed = parseDecimalInteger(value.text);
    if (parsed === undefined)
      this.report(`${name} should be a whole number; found "${value.text}".`);
    return parsed;
  }

  float(name: string, signed = false): number | undefined {
    const value = this.read(name, false);
    if (value === undefined) return undefined;
    const parsed = parseDecimalFloat(value.text, signed);
    if (parsed === undefined) {
      const kind = signed ? "a number" : "a positive number";
      this.report(`${name} should be ${kind}; found "${value.text}".`);
    }
    return parsed;
  }

  hex(name: string): string | undefined {
    const value = this.read(name, false);
    if (value === undefined) return undefined;
    if (value.type === "hexadecimal-sequence") return value.text;
    this.report(`${name} should be a hexadecimal number like 0x1A2B; found "${value.text}".`);
    return undefined;
  }

  resolution(name: string): Resolution | undefined {
    const value = this.read(name, false);
    if (value === undefined) return undefined;
    const match = RESOLUTION.exec(value.text);
    if (match === null) {
      this.report(`${name} should look like 1920x1080; found "${value.text}".`);
      return undefined;
    }
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  /** The value, re-typed if it was quoted when it shouldn't be (or the other way round). */
  private read(name: string, quoted: boolean): AttributeValue | undefined {
    const value = this.values.get(name);
    if (value === undefined) return undefined;
    const isQuoted = value.type === "quoted-string";
    if (quoted && !isQuoted) {
      this.report(`${name} should be in quotes.`);
      return { type: "quoted-string", text: value.text };
    }
    if (!quoted && isQuoted) {
      this.report(`${name} shouldn't be in quotes.`);
      return { type: classifyValue(value.text), text: value.text };
    }
    return value;
  }
}

function orList(options: readonly string[]): string {
  if (options.length <= 1) return options.join("");
  return `${options.slice(0, -1).join(", ")} or ${options.at(-1) ?? ""}`;
}
