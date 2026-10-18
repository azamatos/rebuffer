import { AttributeReader, parseAttributeList } from "./attributes";
import type { TagLine } from "./lines";
import type { Definition, ParseIssue, ParseOptions, UnknownTag } from "./types";
import { parseDecimalFloat, parseDecimalInteger } from "./values";

const VARIABLE_REFERENCE = /\{\$([A-Za-z0-9_-]+)\}/g;
const VARIABLE_NAME = /^[A-Za-z0-9_-]+$/;

/**
 * State shared while one playlist is read: issues, variables (EXT-X-DEFINE), URI resolution,
 * first lines of tags and unknown tags.
 */
export class ParseContext {
  readonly issues: ParseIssue[] = [];
  readonly tagLines: Record<string, number> = {};
  readonly unknownTags: UnknownTag[] = [];
  readonly defines: Definition[] = [];
  /** Defined variables; undefined values are imports and query parameters we can't resolve. */
  private readonly variables = new Map<string, string | undefined>();
  private readonly baseUrl: URL | undefined;
  private readonly reportedTags = new Set<string>();

  constructor(options: ParseOptions) {
    const { baseUrl } = options;
    if (baseUrl === undefined) return;
    try {
      this.baseUrl = new URL(baseUrl);
    } catch {
      this.report(
        0,
        `The base URL "${baseUrl}" isn't a valid absolute URL, so URIs stay relative.`,
      );
    }
  }

  report(line: number, message: string): void {
    this.issues.push({ line, message });
  }

  /** Reports a message once per tag name, e.g. for a tag in the wrong kind of playlist. */
  reportOncePerTag(tag: TagLine, message: string): void {
    if (this.reportedTags.has(tag.name)) return;
    this.reportedTags.add(tag.name);
    this.report(tag.line, message);
  }

  /** Issues sorted by line; the sort is stable, so same-line issues keep their order. */
  sortedIssues(): ParseIssue[] {
    return this.issues.toSorted((a, b) => a.line - b.line);
  }

  noteTag(tag: TagLine): void {
    this.tagLines[tag.name] ??= tag.line;
  }

  /** True for the first occurrence of a tag that may appear only once; reports the others. */
  once(tag: TagLine): boolean {
    const first = this.tagLines[tag.name];
    if (first === undefined || first === tag.line) return true;
    this.report(
      tag.line,
      `${tag.name} appears again (first on line ${first}); this one is ignored.`,
    );
    return false;
  }

  unknown(tag: TagLine): void {
    this.unknownTags.push({ line: tag.line, tag: tag.name, value: tag.value ?? "" });
  }

  /** Parses a tag's attribute list; quoted values get variables substituted. */
  attributes(tag: TagLine, substitute = true): AttributeReader {
    const list = parseAttributeList(tag.value ?? "");
    for (const error of list.errors) this.report(tag.line, `${tag.name}: ${error}`);
    if (substitute) {
      for (const [name, value] of list.values) {
        if (value.type === "quoted-string" && value.text.includes("{$")) {
          list.values.set(name, { ...value, text: this.substitute(value.text, tag.line) });
        }
      }
    }
    return new AttributeReader(list.values, (message) => {
      this.report(tag.line, `${tag.name}: ${message}`);
    });
  }

  /** A tag value that must be a decimal integer, e.g. EXT-X-VERSION:7. */
  integerValue(tag: TagLine): number | undefined {
    const text = tag.value?.trim() ?? "";
    const value = parseDecimalInteger(text);
    if (value === undefined) {
      this.report(tag.line, `${tag.name} should be a whole number; found "${text}".`);
    }
    return value;
  }

  /** A tag value that should be an integer but is read as a number either way (players do). */
  numberValue(tag: TagLine): number | undefined {
    const text = tag.value?.trim() ?? "";
    const value = parseDecimalFloat(text);
    if (value === undefined || text.includes(".")) {
      this.report(tag.line, `${tag.name} should be a whole number; found "${text}".`);
    }
    return value;
  }

  /** Replaces `{$name}` references with defined values (rfc8216bis §4.3). */
  substitute(text: string, line: number): string {
    return text.replace(VARIABLE_REFERENCE, (reference: string, name: string) => {
      if (!this.variables.has(name)) {
        this.report(line, `The variable ${reference} isn't defined by an earlier EXT-X-DEFINE.`);
        return reference;
      }
      return this.variables.get(name) ?? reference;
    });
  }

  /** Resolves a URI against the base URL, if there is one. */
  resolve(uri: string, line: number): string | undefined {
    if (this.baseUrl === undefined) return undefined;
    try {
      return new URL(uri, this.baseUrl).href;
    } catch {
      this.report(line, `"${uri}" can't be resolved against the base URL.`);
      return undefined;
    }
  }

  /** EXT-X-DEFINE: NAME and VALUE, IMPORT, or QUERYPARAM. */
  define(tag: TagLine, playlistKind: "multivariant" | "media"): void {
    const attributes = this.attributes(tag, false);
    const name = attributes.quoted("NAME");
    const imported = attributes.quoted("IMPORT");
    const queryParam = attributes.quoted("QUERYPARAM");
    const forms = [name, imported, queryParam].filter((form) => form !== undefined).length;

    if (forms !== 1) {
      this.report(tag.line, "EXT-X-DEFINE: use exactly one of NAME, IMPORT or QUERYPARAM.");
      return;
    }
    if (name !== undefined) {
      const value = attributes.quoted("VALUE");
      if (value === undefined) this.report(tag.line, "EXT-X-DEFINE: NAME needs a VALUE.");
      else this.addVariable(tag.line, name, "value", value);
    } else if (imported !== undefined) {
      if (playlistKind === "multivariant") {
        this.report(tag.line, "EXT-X-DEFINE: IMPORT is only allowed in media playlists.");
      }
      this.addVariable(tag.line, imported, "import");
    } else if (queryParam !== undefined) {
      this.addVariable(tag.line, queryParam, "queryparam");
    }
  }

  private addVariable(
    line: number,
    name: string,
    source: Definition["source"],
    value?: string,
  ): void {
    if (!VARIABLE_NAME.test(name)) {
      this.report(line, `EXT-X-DEFINE: "${name}" isn't a valid variable name.`);
      return;
    }
    if (this.variables.has(name)) {
      this.report(line, `EXT-X-DEFINE: ${name} is already defined; the first definition is used.`);
      return;
    }
    this.variables.set(name, value);
    this.defines.push({ line, name, source, value });
  }
}
