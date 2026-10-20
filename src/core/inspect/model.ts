import { formatClock } from "@/core/format/time";
import {
  describeCodec,
  formatBitrate,
  lintMeasuredBandwidth,
  lintMedia,
  lintMultivariant,
  variantName,
  type CodecInfo,
  type Container,
  type Finding,
  type MediaPlaylist,
  type MultivariantPlaylist,
  type Resolution,
  type Severity,
} from "@/core/hls";
import { networkSearch, type NetworkSearch } from "@/core/run/links";
import { DEFAULT_STREAM } from "@/core/samples";
import type { Inspection, Measured } from "./load";

/**
 * What the Inspect screen shows, from an Inspection and its measurements: pure functions, so the screen only lays
 * them out.
 */

export type Measurements = ReadonlyMap<string, Measured>;

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

const containerName: Record<Container, string> = {
  fmp4: "fMP4",
  ts: "MPEG-TS",
  mixed: "mixed fMP4 and MPEG-TS",
  unknown: "unknown",
};

/** The media playlist that speaks for the stream: the first variant's, read. */
function firstMedia(inspection: Inspection): MediaPlaylist | undefined {
  if (inspection.top.kind === "media") return inspection.top;
  return inspection.media.find((media) => media.kind === "variant" && media.playlist)?.playlist;
}

function encryption(playlist: MediaPlaylist | undefined): string | undefined {
  if (!playlist) return undefined;
  const methods = [...new Set(playlist.keys.map((key) => key.method).filter((m) => m !== "NONE"))];
  return methods.length === 0 ? "not encrypted" : `encrypted (${methods.join(", ")})`;
}

function timing(playlist: MediaPlaylist | undefined): string | undefined {
  if (!playlist) return undefined;
  const vod = playlist.endList || playlist.playlistType === "VOD";
  return vod ? `VOD, ${formatClock(playlist.totalDuration)}` : "live";
}

/** "Multivariant playlist · HLS v6 · VOD, 1:30 · 5 video qualities · 1 audio track · MPEG-TS segments · not encrypted" */
export function describeSummary(inspection: Inspection): string {
  const { top } = inspection;
  const media = firstMedia(inspection);
  const parts: (string | undefined)[] = [
    top.kind === "multivariant" ? "Multivariant playlist" : "Media playlist",
    top.version === undefined ? undefined : `HLS v${String(top.version)}`,
    timing(media),
  ];
  if (top.kind === "multivariant") {
    const audio = top.renditions.filter((rendition) => rendition.type === "AUDIO").length;
    const subtitles = top.renditions.filter((rendition) => rendition.type === "SUBTITLES").length;
    parts.push(
      plural(top.variants.length, "quality", "qualities"),
      audio > 0 ? plural(audio, "audio track") : undefined,
      subtitles > 0 ? plural(subtitles, "subtitle track") : undefined,
    );
  } else {
    parts.push(plural(top.segments.length, "segment"));
  }
  parts.push(media ? `${containerName[media.container]} segments` : undefined, encryption(media));
  return parts.filter((part) => part !== undefined).join(" · ");
}

/** "audio “English” (en, 2 channels) · subtitles “English” (en) · no I-frame playlists" */
export function describeTracks(top: MultivariantPlaylist): string[] {
  const tracks = top.renditions
    .filter((rendition) => rendition.type !== "CLOSED-CAPTIONS" || rendition.instreamId)
    .map((rendition) => {
      const kind =
        rendition.type === "AUDIO"
          ? "audio"
          : rendition.type === "SUBTITLES"
            ? "subtitles"
            : rendition.type === "VIDEO"
              ? "video"
              : "captions";
      const details = [
        rendition.language,
        rendition.channels ? plural(Number.parseInt(rendition.channels, 10), "channel") : undefined,
        `group ${rendition.groupId}`,
      ].filter((detail) => detail !== undefined);
      return `${kind} “${rendition.name}” (${details.join(", ")})`;
    });
  const iFrames = top.iFrameVariants.length;
  return [...tracks, iFrames === 0 ? "no I-frame playlists" : plural(iFrames, "I-frame playlist")];
}

/** One row of the quality ladder, highest first. */
export interface LadderRow {
  name: string;
  line: number;
  bandwidth: number | undefined;
  averageBandwidth: number | undefined;
  resolution: Resolution | undefined;
  frameRate: number | undefined;
  codecs: string[] | undefined;
  video: CodecInfo | undefined;
  audio: CodecInfo | undefined;
  /** The measured peak: the variant's own segments, plus its audio track's when audio comes separately. */
  measuredBps: number | undefined;
  /** Whether the measured peak includes separate audio. */
  withAudio: boolean;
  /** How far the measured peak is over the declared BANDWIDTH, when it's more than 10% over (0.21 = 21%). */
  over: number | undefined;
  /** Its shade on a 0–4 scale, lowest quality darkest, as on the charts. */
  shade: number;
  /** Its media playlist's address. */
  mediaUrl: string | undefined;
}

/** The audio track a variant plays with, when it comes as a playlist of its own: the group's default, or its first. */
function audioUrl(top: MultivariantPlaylist, group: string | undefined): string | undefined {
  if (group === undefined) return undefined;
  const members = top.renditions.filter(
    (rendition) =>
      rendition.type === "AUDIO" && rendition.groupId === group && rendition.resolvedUri,
  );
  return (members.find((rendition) => rendition.default) ?? members[0])?.resolvedUri;
}

export function ladderRows(inspection: Inspection, measured: Measurements): LadderRow[] {
  const { top } = inspection;
  if (top.kind !== "multivariant") return [];
  const ranked = [...top.variants].sort((a, b) => (a.bandwidth ?? 0) - (b.bandwidth ?? 0));
  return [...top.variants]
    .sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0))
    .map((variant) => {
      const codecs = variant.codecs?.map(describeCodec);
      const video = variant.resolvedUri ? measured.get(variant.resolvedUri)?.peakBps : undefined;
      const separateAudio = audioUrl(top, variant.audio);
      const audio = separateAudio ? measured.get(separateAudio)?.peakBps : undefined;
      const measuredBps = video === undefined ? undefined : video + (audio ?? 0);
      const over =
        measuredBps !== undefined && variant.bandwidth !== undefined
          ? measuredBps / variant.bandwidth - 1
          : undefined;
      const rank = ranked.indexOf(variant);
      return {
        name: variantName(variant),
        line: variant.line,
        bandwidth: variant.bandwidth,
        averageBandwidth: variant.averageBandwidth,
        resolution: variant.resolution,
        frameRate: variant.frameRate,
        codecs: variant.codecs,
        video: codecs?.find((codec) => codec.kind === "video"),
        audio: codecs?.find((codec) => codec.kind === "audio"),
        measuredBps,
        withAudio: audio !== undefined,
        over: over !== undefined && over > 0.1 ? over : undefined,
        shade: ranked.length <= 1 ? 4 : Math.round((rank * 4) / (ranked.length - 1)),
        mediaUrl: variant.resolvedUri,
      };
    });
}

/** Where a finding comes from. */
export interface FindingSource {
  file: string;
  line: number | undefined;
}

/** A finding with every file it was found in: one rule broken the same way in five renditions is one finding. */
export interface SourcedFinding {
  id: string;
  severity: Severity;
  message: string;
  detail: string;
  ref: Finding["ref"];
  sources: FindingSource[];
  /** For a variant whose segments peak over its declared bandwidth: what it declares, to run it at that speed. */
  declaredBps?: number;
}

/** A media playlist's name relative to the top playlist's folder: "720p/index.m3u8". */
export function relativeName(url: string | undefined, base: string | undefined): string {
  if (url === undefined) return "a media playlist";
  const folder = base?.slice(0, base.lastIndexOf("/") + 1);
  if (folder && url.startsWith(folder)) return url.slice(folder.length).split("?")[0] ?? url;
  try {
    return new URL(url).pathname.split("/").slice(-2).join("/");
  } catch {
    return url;
  }
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, note: 2 };

/** Every finding: the top playlist's, each measured variant's bandwidth, and each media playlist's, grouped. */
export function inspectionFindings(
  inspection: Inspection,
  measured: Measurements,
): SourcedFinding[] {
  const { top } = inspection;
  const found: (Finding & { file: string; declaredBps?: number })[] = [];
  if (top.kind === "multivariant") {
    for (const finding of lintMultivariant(top)) found.push({ ...finding, file: inspection.file });
    const rows = ladderRows(inspection, measured);
    for (const variant of top.variants) {
      const row = rows.find((candidate) => candidate.line === variant.line);
      if (row?.measuredBps === undefined) continue;
      const finding = lintMeasuredBandwidth(variant, row.measuredBps);
      if (finding) {
        found.push({
          ...finding,
          file: inspection.file,
          ...(variant.bandwidth === undefined ? {} : { declaredBps: variant.bandwidth }),
        });
      }
    }
    for (const media of inspection.media) {
      if (!media.playlist) continue;
      const file = relativeName(media.url, inspection.url);
      for (const finding of lintMedia(media.playlist)) found.push({ ...finding, file });
    }
  } else {
    for (const finding of lintMedia(top)) found.push({ ...finding, file: inspection.file });
  }

  const grouped = new Map<string, SourcedFinding>();
  for (const { file, line, declaredBps, ...finding } of found) {
    const key = `${finding.id}\n${finding.message}\n${finding.detail}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.sources.push({ file, line });
      continue;
    }
    grouped.set(key, {
      id: finding.id,
      severity: finding.severity,
      message: finding.message,
      detail: finding.detail,
      ref: finding.ref,
      sources: [{ file, line }],
      ...(declaredBps === undefined ? {} : { declaredBps }),
    });
  }
  return [...grouped.values()].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

/** "1 error · 2 warnings · 1 note" as counts. */
export function countFindings(findings: readonly SourcedFinding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, note: 0 };
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}

/** A media playlist's segments, for the Segments panel. */
export interface SegmentStats {
  count: number;
  targetDuration: number | undefined;
  totalS: number;
  container: string;
  discontinuities: number;
  durations: number[];
  /** Indexes of the segments over the target duration (rounded, as the rule reads it). */
  overTarget: number[];
  /** The histogram in words. */
  description: string;
}

const seconds = (value: number) => `${Number(value.toFixed(3))} s`;

export function segmentStats(playlist: MediaPlaylist): SegmentStats {
  const durations = playlist.segments.map((segment) => segment.duration);
  const target = playlist.targetDuration;
  const overTarget = durations.flatMap((duration, index) =>
    target !== undefined && Math.round(duration) > target ? [index] : [],
  );
  // The most common duration, then the segments that differ from it.
  const counts = new Map<number, number>();
  for (const duration of durations) counts.set(duration, (counts.get(duration) ?? 0) + 1);
  const usual = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const sentences: string[] = [];
  if (usual === undefined) {
    sentences.push("No segments.");
  } else {
    const same = counts.get(usual) ?? 0;
    sentences.push(
      same === durations.length
        ? `${plural(durations.length, "segment")}, each ${seconds(usual)}.`
        : `${plural(durations.length, "segment")}, ${String(same)} of them ${seconds(usual)}.`,
    );
    const others = durations.flatMap((duration, index) => (duration === usual ? [] : [index]));
    const named = others.slice(0, 4).map((index) => {
      const duration = durations[index] ?? 0;
      const which = index === durations.length - 1 ? "the last" : `segment ${String(index + 1)}`;
      const over = overTarget.includes(index) && target !== undefined;
      return `${which} lasts ${seconds(duration)}${over ? `, over the ${seconds(target)} target` : ""}`;
    });
    if (named.length > 0) {
      const more = others.length - named.length;
      const first = named.join("; ");
      sentences.push(
        `${first.charAt(0).toUpperCase()}${first.slice(1)}${more > 0 ? `; ${plural(more, "other differs", "others differ")}` : ""}.`,
      );
    }
  }
  return {
    count: durations.length,
    targetDuration: target,
    totalS: playlist.totalDuration,
    container: containerName[playlist.container],
    discontinuities: playlist.segments.filter((segment) => segment.discontinuity).length,
    durations,
    overTarget,
    description: sentences.join(" "),
  };
}

/** The Run screen's link for a stream (our film is the default, so it's left out). */
export function streamRunSearch(url: string): { stream?: string } {
  return url === DEFAULT_STREAM.url ? {} : { stream: url };
}

/**
 * The Run screen's link for "run it at the declared bandwidth": a steady network a little over what a variant
 * declares, so the player picks that variant, and then meets segments bigger than declared.
 */
export function declaredRunSearch(
  url: string,
  declaredBps: number,
): { stream?: string } & NetworkSearch {
  const mbps = Math.ceil((declaredBps * 1.1) / 1e5) / 10;
  return {
    ...streamRunSearch(url),
    ...networkSearch({
      id: undefined,
      name: `Steady ${String(mbps)} Mbps`,
      curve: { shape: "steps", rttMs: 50, lengthS: 60, points: [{ t: 0, mbps }] },
    }),
  };
}

/** "3.1 Mbps", the speed `declaredRunSearch` runs at. */
export const declaredRunSpeed = (declaredBps: number) =>
  formatBitrate((Math.ceil((declaredBps * 1.1) / 1e5) / 10) * 1e6);

/** What to ask the browser about a variant (Media Capabilities), or undefined when its codecs aren't declared. */
export interface PlaybackQuery {
  video:
    | { contentType: string; width: number; height: number; bitrate: number; framerate: number }
    | undefined;
  audio: { contentType: string } | undefined;
  /** For MediaSource.isTypeSupported, where Media Capabilities isn't there. */
  type: string;
}

export function playbackQuery(row: LadderRow): PlaybackQuery | undefined {
  if (!row.codecs || row.codecs.length === 0) return undefined;
  const video = row.codecs.filter((codec) => describeCodec(codec).kind === "video");
  const audio = row.codecs.filter((codec) => describeCodec(codec).kind === "audio");
  // hls.js hands MPEG-TS over as fMP4, so MP4 is what the browser has to decode either way.
  return {
    video:
      video.length > 0
        ? {
            contentType: `video/mp4; codecs="${video.join(",")}"`,
            width: row.resolution?.width ?? 1280,
            height: row.resolution?.height ?? 720,
            bitrate: row.bandwidth ?? 1_000_000,
            framerate: row.frameRate ?? 30,
          }
        : undefined,
    audio: audio.length > 0 ? { contentType: `audio/mp4; codecs="${audio.join(",")}"` } : undefined,
    type: `${video.length > 0 ? "video" : "audio"}/mp4; codecs="${row.codecs.join(",")}"`,
  };
}

/** What the browser said, for the ladder's last column. */
export function describePlayback(
  answer: { supported: boolean; smooth: boolean } | "unknown" | undefined,
): string {
  if (answer === undefined) return "Unknown until downloaded";
  if (answer === "unknown") return "Checking…";
  if (!answer.supported) return "Can't play here";
  return answer.smooth ? "Plays, smooth" : "Plays, may stutter";
}
