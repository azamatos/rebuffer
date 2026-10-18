import type { ParseContext } from "./context";
import type { TagLine } from "./lines";
import type { Key, StartOffset } from "./types";

/** Tags allowed in both kinds of playlist (RFC 8216 §4.3.1 and §4.3.5, rfc8216bis EXT-X-DEFINE). */
export interface CommonState {
  version?: number | undefined;
  independentSegments: boolean;
  start?: StartOffset | undefined;
}

const KEY_METHODS = ["NONE", "AES-128", "SAMPLE-AES", "SAMPLE-AES-CTR"];

/** Handles a tag shared by both playlist kinds; returns false when the tag is not one of them. */
export function readCommonTag(
  tag: TagLine,
  context: ParseContext,
  state: CommonState,
  kind: "multivariant" | "media",
): boolean {
  switch (tag.name) {
    case "EXTM3U":
      context.report(tag.line, "#EXTM3U appears again; only the first line should have it.");
      return true;
    case "EXT-X-VERSION":
      if (context.once(tag)) state.version = context.integerValue(tag);
      return true;
    case "EXT-X-INDEPENDENT-SEGMENTS":
      state.independentSegments = true;
      return true;
    case "EXT-X-START":
      if (context.once(tag)) state.start = readStart(tag, context);
      return true;
    case "EXT-X-DEFINE":
      context.define(tag, kind);
      return true;
    default:
      return false;
  }
}

function readStart(tag: TagLine, context: ParseContext): StartOffset | undefined {
  const attributes = context.attributes(tag);
  if (!attributes.require("TIME-OFFSET")) return undefined;
  const timeOffset = attributes.float("TIME-OFFSET", true);
  if (timeOffset === undefined) return undefined;
  return { line: tag.line, timeOffset, precise: attributes.yesNo("PRECISE") ?? false };
}

/** Reads EXT-X-KEY or EXT-X-SESSION-KEY (RFC 8216 §4.3.2.4, §4.3.4.5). */
export function readKey(tag: TagLine, context: ParseContext): Key | undefined {
  const attributes = context.attributes(tag);
  if (!attributes.require("METHOD")) return undefined;
  const method = attributes.enumerated("METHOD");
  if (method === undefined) return undefined;
  if (!KEY_METHODS.includes(method)) {
    context.report(tag.line, `${tag.name}: METHOD=${method} isn't a method RFC 8216 defines.`);
  }

  const uri = attributes.quoted("URI");
  if (method !== "NONE" && uri === undefined) {
    context.report(tag.line, `${tag.name}: URI is missing; METHOD=${method} needs one.`);
  }

  const iv = attributes.hex("IV");
  if (iv !== undefined && iv.length !== 34) {
    context.report(
      tag.line,
      `${tag.name}: IV should have 32 hexadecimal digits (128 bits); it has ${iv.length - 2}.`,
    );
  }

  return {
    line: tag.line,
    method,
    uri,
    resolvedUri: uri === undefined ? undefined : context.resolve(uri, tag.line),
    iv,
    keyFormat: attributes.quoted("KEYFORMAT"),
    keyFormatVersions: attributes.quoted("KEYFORMATVERSIONS"),
    attributes: attributes.record(),
  };
}
