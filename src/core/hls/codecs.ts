import type { CodecInfo, CodecKind } from "./types";

// Codec strings follow RFC 6381 and the codec-specific ISO/IEC 14496-15 (AVC, HEVC), AV1-ISOBMFF,
// VP9-ISOBMFF and Dolby Vision conventions. Each decoder returns undefined for a string it can't
// read, which becomes kind "unknown".

type Decoder = (parts: string[], codec: string) => CodecInfo | undefined;

const AVC_PROFILES = new Map<number, string>([
  [66, "Baseline"],
  [77, "Main"],
  [88, "Extended"],
  [100, "High"],
  [110, "High 10"],
  [122, "High 4:2:2"],
  [244, "High 4:4:4"],
]);

const HEVC_PROFILES = new Map<number, string>([
  [1, "Main"],
  [2, "Main 10"],
  [3, "Main Still Picture"],
  [4, "RExt"],
  [5, "High Throughput"],
  [9, "SCC"],
]);

const AV1_PROFILES = ["Main", "High", "Professional"];

/** MPEG-4 Audio object types after "mp4a.40." (ISO/IEC 14496-3). */
const MPEG4_AUDIO = new Map<number, [string, string | undefined, string]>([
  [1, ["AAC", "Main", "AAC Main"]],
  [2, ["AAC", "LC", "AAC-LC"]],
  [5, ["AAC", "HE", "HE-AAC"]],
  [23, ["AAC", "LD", "AAC-LD"]],
  [29, ["AAC", "HE v2", "HE-AAC v2"]],
  [34, ["MP3", undefined, "MP3"]],
  [39, ["AAC", "ELD", "AAC-ELD"]],
  [42, ["AAC", "xHE", "xHE-AAC"]],
]);

/** Object type indications after "mp4a." other than 40 (MP4 registration authority). */
const MP4A_OBJECT_TYPES = new Map<string, [string, string | undefined, string]>([
  ["66", ["AAC", "Main", "AAC Main"]],
  ["67", ["AAC", "LC", "AAC-LC"]],
  ["69", ["MP3", undefined, "MP3"]],
  ["6b", ["MP3", undefined, "MP3"]],
  ["a5", ["Dolby Digital", undefined, "Dolby Digital (AC-3)"]],
  ["a6", ["Dolby Digital Plus", undefined, "Dolby Digital Plus (E-AC-3)"]],
]);

const DECODERS = new Map<string, Decoder>([
  ["avc1", avc],
  ["avc3", avc],
  ["hvc1", hevc],
  ["hev1", hevc],
  ["av01", av1],
  ["vp09", vp9],
  ["vp9", (_, codec) => info(codec, "video", "VP9")],
  ["vp8", (_, codec) => info(codec, "video", "VP8")],
  ["vp08", (_, codec) => info(codec, "video", "VP8")],
  ["mp4a", mp4a],
  ["mp3", (_, codec) => info(codec, "audio", "MP3")],
  ["ac-3", (_, codec) => info(codec, "audio", "Dolby Digital", { label: "Dolby Digital (AC-3)" })],
  [
    "ec-3",
    (_, codec) =>
      info(codec, "audio", "Dolby Digital Plus", { label: "Dolby Digital Plus (E-AC-3)" }),
  ],
  ["ac-4", (_, codec) => info(codec, "audio", "Dolby AC-4")],
  ["opus", (_, codec) => info(codec, "audio", "Opus")],
  ["flac", (_, codec) => info(codec, "audio", "FLAC")],
  ["dvh1", dolbyVision],
  ["dvhe", dolbyVision],
  ["dva1", dolbyVision],
  ["dvav", dolbyVision],
  ["dav1", dolbyVision],
  ["wvtt", (_, codec) => info(codec, "text", "WebVTT")],
  ["stpp", ttml],
]);

/** Decodes one codec string, e.g. `avc1.640028` → H.264 High 4.0. Never throws. */
export function describeCodec(codec: string): CodecInfo {
  const trimmed = codec.trim();
  // SUPPLEMENTAL-CODECS entries may end in compatibility brands: "dvh1.08.07/db4h".
  const parts = (trimmed.split("/")[0] ?? "").split(".");
  const decoder = DECODERS.get((parts[0] ?? "").toLowerCase());
  return decoder?.(parts, trimmed) ?? info(trimmed, "unknown", trimmed);
}

/** Decodes a CODECS attribute value: `"avc1.640028,mp4a.40.2"`. */
export function describeCodecs(list: string): CodecInfo[] {
  return list
    .split(",")
    .map((codec) => codec.trim())
    .filter((codec) => codec !== "")
    .map(describeCodec);
}

function info(
  codec: string,
  kind: CodecKind,
  name: string,
  extra: { profile?: string | undefined; level?: string | undefined; label?: string } = {},
): CodecInfo {
  const { profile, level } = extra;
  const label =
    extra.label ?? [name, profile, level].filter((part) => part !== undefined).join(" ");
  return { codec, kind, name, profile, level, label };
}

/** `avc1.PPCCLL` in hex (profile_idc, constraint flags, level_idc), or the legacy `avc1.66.30`. */
function avc(parts: string[], codec: string): CodecInfo | undefined {
  const [, first = "", second] = parts;
  let profileIdc: number;
  let constraints = 0;
  let levelIdc: number;
  if (parts.length === 2 && /^[0-9a-f]{6}$/i.test(first)) {
    profileIdc = parseInt(first.slice(0, 2), 16);
    constraints = parseInt(first.slice(2, 4), 16);
    levelIdc = parseInt(first.slice(4, 6), 16);
  } else if (parts.length === 3 && /^\d+$/.test(first) && /^\d+$/.test(second ?? "")) {
    profileIdc = Number(first);
    levelIdc = Number(second);
  } else {
    return undefined;
  }

  const constraintSet1 = (constraints & 0x40) !== 0;
  const constraintSet3 = (constraints & 0x10) !== 0;
  const profile =
    profileIdc === 66 && constraintSet1 ? "Constrained Baseline" : AVC_PROFILES.get(profileIdc);
  // Level 1b is written as 9, or as 11 with constraint_set3 in the Baseline, Main and Extended profiles.
  const level =
    levelIdc === 9 || (levelIdc === 11 && constraintSet3 && [66, 77, 88].includes(profileIdc))
      ? "1b"
      : (levelIdc / 10).toFixed(1);

  if (profile === undefined) {
    return info(codec, "video", "H.264", {
      level,
      label: `H.264 profile ${profileIdc}, level ${level}`,
    });
  }
  return info(codec, "video", "H.264", { profile, level });
}

/** `hvc1.[A|B|C]P.compat.TLL.constraints`: profile, compatibility flags, tier and level_idc. */
function hevc(parts: string[], codec: string): CodecInfo | undefined {
  const [, profileText = "", compatibility = "", tierLevel = ""] = parts;
  const profileMatch = /^[ABC]?(\d+)$/i.exec(profileText);
  const tierMatch = /^([LH])(\d+)$/i.exec(tierLevel);
  if (profileMatch === null || tierMatch === null || !/^[0-9a-f]{1,8}$/i.test(compatibility)) {
    return undefined;
  }

  const profileIdc = Number(profileMatch[1]);
  const profile = HEVC_PROFILES.get(profileIdc) ?? `profile ${profileIdc}`;
  const level = (Number(tierMatch[2]) / 30).toFixed(1);
  const highTier = tierMatch[1]?.toUpperCase() === "H";
  const label = `HEVC ${profile} ${level}${highTier ? " (High tier)" : ""}`;
  return info(codec, "video", "HEVC", { profile, level, label });
}

/** `av01.P.LLT.DD`: profile, seq_level_idx with tier, bit depth (AV1 codecs parameter). */
function av1(parts: string[], codec: string): CodecInfo | undefined {
  const [, profileText = "", levelText = "", depthText = ""] = parts;
  const levelMatch = /^(\d{2})([MH])$/i.exec(levelText);
  if (!/^\d$/.test(profileText) || levelMatch === null || !/^\d{2}$/.test(depthText)) {
    return undefined;
  }

  const profileIndex = Number(profileText);
  const profile = AV1_PROFILES[profileIndex] ?? `profile ${profileIndex}`;
  const levelIndex = Number(levelMatch[1]);
  // seq_level_idx 0–23 maps to levels 2.0–7.3; 31 means "no level constraints".
  const level =
    levelIndex <= 23 ? `${2 + Math.floor(levelIndex / 4)}.${levelIndex % 4}` : undefined;
  const highTier = levelMatch[2]?.toUpperCase() === "H";
  const label = [
    `AV1 ${profile}`,
    level === undefined ? "" : ` ${level}`,
    highTier ? " (High tier)" : "",
    `, ${Number(depthText)}-bit`,
  ].join("");
  return info(codec, "video", "AV1", { profile, level, label });
}

/** `vp09.PP.LL.DD`: profile, level × 10, bit depth (VP9 codecs parameter). */
function vp9(parts: string[], codec: string): CodecInfo | undefined {
  const [, profileText = "", levelText = "", depthText = ""] = parts;
  if (![profileText, levelText, depthText].every((part) => /^\d{2}$/.test(part))) return undefined;
  const profile = `Profile ${Number(profileText)}`;
  const level = (Number(levelText) / 10).toFixed(1);
  const label = `VP9 ${profile} ${level}, ${Number(depthText)}-bit`;
  return info(codec, "video", "VP9", { profile, level, label });
}

/** `mp4a.OO[.A]`: object type indication in hex; for 40 (MPEG-4 Audio), the audio object type. */
function mp4a(parts: string[], codec: string): CodecInfo | undefined {
  const [, objectType = "", audioObjectType] = parts;
  if (objectType === "40") {
    if (audioObjectType === undefined || !/^\d+$/.test(audioObjectType)) return undefined;
    const known = MPEG4_AUDIO.get(Number(audioObjectType));
    if (known === undefined) {
      return info(codec, "audio", "MPEG-4 Audio", {
        label: `MPEG-4 Audio (object type ${Number(audioObjectType)})`,
      });
    }
    const [name, profile, label] = known;
    return info(codec, "audio", name, { profile, label });
  }
  const known = MP4A_OBJECT_TYPES.get(objectType.toLowerCase());
  if (known === undefined) return undefined;
  const [name, profile, label] = known;
  return info(codec, "audio", name, { profile, label });
}

/** `dvh1.PP.LL`: Dolby Vision profile and level, each two digits. */
function dolbyVision(parts: string[], codec: string): CodecInfo | undefined {
  const [, profileText = "", levelText = ""] = parts;
  if (!/^\d{2}$/.test(profileText) || !/^\d{2}$/.test(levelText)) return undefined;
  const profile = `Profile ${Number(profileText)}`;
  const level = String(Number(levelText));
  return info(codec, "video", "Dolby Vision", {
    profile,
    level,
    label: `Dolby Vision ${profile}, level ${level}`,
  });
}

/** `stpp[.ttml.im1t]`: TTML in fMP4; im1t and im1i are the IMSC1 text and image profiles. */
function ttml(parts: string[], codec: string): CodecInfo {
  const imsc = parts[2]?.toLowerCase();
  const profile = imsc === "im1t" ? "IMSC1 Text" : imsc === "im1i" ? "IMSC1 Image" : undefined;
  return info(codec, "text", "TTML", { profile, label: "TTML" });
}
