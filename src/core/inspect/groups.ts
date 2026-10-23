import { formatMbps } from "@/core/format/bitrate";
import {
  describeCodec,
  type CodecInfo,
  type MediaPlaylist,
  type Resolution,
  type Variant,
} from "@/core/hls";
import type { Inspection } from "./load";
import { ladderRows, relativeName, type Measurements } from "./model";

/**
 * The ladder as people read a big stream (Apple's example has 100 variants): grouped by video codec and range, one
 * row per video playlist with the audio its variants pair it with, and the playlists to chart in the same groups.
 */

/** A video playlist and the variants that play it: one row of the grouped ladder. */
export interface VideoRow {
  /** Its media playlist's address; the Segments panel knows it by this. Undefined when it can't be resolved. */
  url: string | undefined;
  /** What tells it apart within its group: "hls290", "720p". */
  name: string;
  /** Its path from the top playlist's folder, whole. */
  path: string;
  resolution: Resolution | undefined;
  frameRate: number | undefined;
  video: CodecInfo | undefined;
  /** The audio each variant pairs it with, in words, each once, highest bandwidth first. */
  audio: string[];
  /** Its variants' lines in the top playlist, highest bandwidth first. */
  lines: number[];
  /** The bandwidth its variants declare, lowest and highest. */
  declared: { low: number; high: number } | undefined;
  /** The highest measured peak among its variants, audio included where it comes separately. */
  measuredBps: number | undefined;
  /** How far that peak is over what its variant declares, when more than 10% (0.17 = 17%). */
  over: number | undefined;
  /** Its shade on a 0–4 scale within its group, lowest quality darkest, as on the charts. */
  shade: number;
  /** Its audio comes as playlists of their own, which its variants' BANDWIDTH counts too. */
  separateAudio: boolean;
}

/** Video playlists of one codec and range: "HEVC · HDR (PQ)". */
export interface VideoGroup {
  key: string;
  codec: string;
  range: string;
  rows: VideoRow[];
  variants: number;
}

const CODEC_ORDER = ["H.264", "HEVC", "Dolby Vision", "AV1", "VP9"];
const RANGES = { SDR: "SDR", HLG: "HDR (HLG)", PQ: "HDR (PQ)" } as const;
const RANGE_ORDER = ["SDR", "HDR (HLG)", "HDR (PQ)"];

const codecsOf = (variant: Variant) => variant.codecs?.map(describeCodec) ?? [];

/** The common start of `names` that ends at a separator, so what's left tells them apart: "Job…-hls_bundle_". */
function commonStem(names: readonly string[]): string {
  const [first, ...rest] = names;
  if (first === undefined || rest.length === 0) return "";
  let end = first.length;
  for (const name of rest) {
    let i = 0;
    while (i < end && i < name.length && name[i] === first[i]) i++;
    end = i;
  }
  const stem = first.slice(0, end);
  const cut = Math.max(...["-", "_", ".", "/"].map((separator) => stem.lastIndexOf(separator)));
  return cut < 0 ? "" : stem.slice(0, cut + 1);
}

/** Each path's distinguishing part: its file name, or its folder's when every file is called the same. */
function baseNames(paths: readonly string[]): string[] {
  const parts = paths.map((path) => path.split("?")[0]?.split("/") ?? [path]);
  const files = new Set(parts.map((segments) => segments.at(-1)));
  const sameFile = paths.length > 1 && files.size === 1;
  return parts.map((segments) => {
    const name = (sameFile ? segments.at(-2) : undefined) ?? segments.at(-1) ?? "";
    return name.replace(/\.m3u8$/i, "");
  });
}

/** The ladder grouped by video codec and range (H.264 first: every browser plays it), highest quality first. */
export function videoGroups(inspection: Inspection, measured: Measurements): VideoGroup[] {
  const { top } = inspection;
  if (top.kind !== "multivariant") return [];
  const ladder = new Map(ladderRows(inspection, measured).map((row) => [row.line, row]));

  // Variants that play one video playlist share a row.
  const byPlaylist = new Map<string, Variant[]>();
  for (const variant of top.variants) {
    const key = variant.resolvedUri ?? variant.uri;
    byPlaylist.set(key, [...(byPlaylist.get(key) ?? []), variant]);
  }
  const paths = [...byPlaylist.keys()].map((key) =>
    relativeName(byPlaylist.get(key)?.[0]?.resolvedUri ?? key, inspection.url),
  );
  // Names lose what all of them share, then (below) what their group's share.
  const bases = baseNames(paths);
  const shared = commonStem(bases);
  const names = bases.map((name) => name.slice(shared.length) || name);

  const groups = new Map<string, { codec: string; range: string; rows: VideoRow[] }>();
  [...byPlaylist.values()].forEach((variants, i) => {
    const sorted = [...variants].sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));
    const [first] = sorted;
    if (!first) return;
    const video = codecsOf(first).find((codec) => codec.kind === "video");
    const codec = video?.name ?? (first.codecs ? "Audio only" : "Codec not declared");
    const range = RANGES[first.videoRange ?? "SDR"];
    const audio = [
      ...new Set(
        sorted.map(
          (variant) =>
            codecsOf(variant).find((candidate) => candidate.kind === "audio")?.label ??
            (variant.audio ? `audio group “${variant.audio}”` : "no audio declared"),
        ),
      ),
    ];
    const bandwidths = sorted.flatMap((variant) =>
      variant.bandwidth === undefined ? [] : [variant.bandwidth],
    );
    const rows = sorted.flatMap((variant) => {
      const row = ladder.get(variant.line);
      return row ? [row] : [];
    });
    const peaks = rows.flatMap((row) => (row.measuredBps === undefined ? [] : [row.measuredBps]));
    const overs = rows.flatMap((row) => (row.over === undefined ? [] : [row.over]));
    const key = `${codec}\n${range}`;
    const group = groups.get(key) ?? { codec, range, rows: [] };
    groups.set(key, group);
    group.rows.push({
      url: first.resolvedUri,
      name: names[i] ?? first.uri,
      path: paths[i] ?? first.uri,
      resolution: first.resolution,
      frameRate: first.frameRate,
      video,
      audio,
      lines: sorted.map((variant) => variant.line),
      declared:
        bandwidths.length === 0
          ? undefined
          : { low: Math.min(...bandwidths), high: Math.max(...bandwidths) },
      measuredBps: peaks.length === 0 ? undefined : Math.max(...peaks),
      over: overs.length === 0 ? undefined : Math.max(...overs),
      shade: 0,
      separateAudio: sorted.some((variant) =>
        top.renditions.some(
          (rendition) =>
            rendition.type === "AUDIO" &&
            rendition.groupId === variant.audio &&
            rendition.uri !== undefined,
        ),
      ),
    });
  });

  const rank = (list: readonly string[], value: string) => {
    const index = list.indexOf(value);
    return index < 0 ? list.length : index;
  };
  return [...groups.entries()]
    .sort(
      ([, a], [, b]) =>
        rank(CODEC_ORDER, a.codec) - rank(CODEC_ORDER, b.codec) ||
        a.codec.localeCompare(b.codec) ||
        rank(RANGE_ORDER, a.range) - rank(RANGE_ORDER, b.range),
    )
    .map(([key, { codec, range, rows }]) => {
      const highest = (row: VideoRow) => row.declared?.high ?? 0;
      const sorted = [...rows].sort((a, b) => highest(b) - highest(a));
      // Within a group, names lose what all of them share: "Job2dae…-hls_bundle_hls290" reads "hls290".
      const stem = commonStem(sorted.map((row) => row.name));
      const ranked = [...sorted].reverse();
      return {
        key,
        codec,
        range,
        variants: sorted.reduce((total, row) => total + row.lines.length, 0),
        rows: sorted.map((row) => ({
          ...row,
          name: row.name.slice(stem.length) || row.name,
          shade:
            ranked.length <= 1 ? 4 : Math.round((ranked.indexOf(row) * 4) / (ranked.length - 1)),
        })),
      };
    });
}

/** "1080p", from the picture size; undefined without one. */
export const heightName = (resolution: Resolution | undefined) =>
  resolution ? `${String(resolution.height)}p` : undefined;

/**
 * Whether a row matches what someone typed into "Find a rendition": every word of it appears in the row's height,
 * picture size, names, codec, group, declared bitrate or audio ("1080p hevc", "hls290", "18 mbps").
 */
export function matchesFind(group: VideoGroup, row: VideoRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const declared = row.declared
    ? [formatMbps(row.declared.low), formatMbps(row.declared.high)].join(" ")
    : "";
  const haystack = [
    heightName(row.resolution),
    row.resolution && `${String(row.resolution.width)}x${String(row.resolution.height)}`,
    row.name,
    row.path,
    row.video?.label,
    row.video?.codec,
    group.codec,
    group.range,
    declared,
    ...row.audio,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** One playlist the Segments panel can chart. */
export interface PlaylistChoice {
  key: string;
  label: string;
  playlist: MediaPlaylist;
  kind: "video" | "audio" | "subtitles";
  /** What its variants declare, highest, to draw against its segments; video only. */
  declaredBps?: number;
  /** Its shade within its group, as in the ladder. */
  shade?: number;
  /** Its declared bandwidth counts separate audio its segments don't carry. */
  separateAudio?: boolean;
}

export interface ChoiceGroup {
  label: string;
  choices: PlaylistChoice[];
}

/** Above this many playlists, the chooser is a select with groups instead of buttons. */
export const MAX_CHIPS = 12;

/**
 * The playlists the Segments panel can show, in the ladder's groups, then audio and subtitles. A media playlist
 * given on its own is the one choice.
 */
export function playlistChoices(
  inspection: Inspection,
  groups: readonly VideoGroup[],
): ChoiceGroup[] {
  const { top } = inspection;
  if (top.kind === "media") {
    return [
      {
        label: "Playlist",
        choices: [{ key: "top", label: inspection.file, playlist: top, kind: "video" }],
      },
    ];
  }
  const read = new Map(
    inspection.media.flatMap((media) =>
      media.url && media.playlist ? [[media.url, media] as const] : [],
    ),
  );
  const result: ChoiceGroup[] = groups.map((group) => ({
    label: `${group.codec} · ${group.range}`,
    choices: group.rows.flatMap((row) => {
      const media = row.url ? read.get(row.url) : undefined;
      if (!row.url || !media?.playlist) return [];
      const parts = [
        heightName(row.resolution),
        row.declared && formatMbps(row.declared.high),
        row.name !== heightName(row.resolution) ? row.name : undefined,
        row.audio.length > 1 ? `${String(row.audio.length)} audio` : undefined,
      ].filter(Boolean);
      return [
        {
          key: row.url,
          label: parts.join(" · "),
          playlist: media.playlist,
          kind: "video" as const,
          ...(row.declared && { declaredBps: row.declared.high }),
          shade: row.shade,
          separateAudio: row.separateAudio,
        },
      ];
    }),
  }));

  // An audio playlist by its name and the codec its group's variants declare.
  const audioCodec = new Map<string, string>();
  for (const variant of top.variants) {
    const label = codecsOf(variant).find((codec) => codec.kind === "audio")?.label;
    if (variant.audio && label && !audioCodec.has(variant.audio))
      audioCodec.set(variant.audio, label);
  }
  const renditionOf = (url: string) =>
    top.renditions.find((rendition) => rendition.resolvedUri === url);
  for (const [kind, label] of [
    ["audio", "Audio"],
    ["subtitles", "Subtitles"],
    ["video", "Other video"],
  ] as const) {
    const choices = inspection.media.flatMap((media) => {
      if (media.kind !== kind || !media.url || !media.playlist) return [];
      const rendition = renditionOf(media.url);
      const codec = kind === "audio" && rendition ? audioCodec.get(rendition.groupId) : undefined;
      return [
        {
          key: media.url,
          label: codec ? `${media.name} · ${codec}` : media.name,
          playlist: media.playlist,
          kind,
        },
      ];
    });
    if (choices.length > 0) result.push({ label, choices });
  }
  return result.filter((group) => group.choices.length > 0);
}
