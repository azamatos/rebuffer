import { describeCodec } from "./codecs";
import { APPLE_AUTHORING_SPEC, count, rfc8216 } from "./findings";
import { capitalize, formatInteger, variantName, variantNameWithBitrate } from "./format";
import type { Finding, MultivariantPlaylist, RenditionType, Variant } from "./types";
import { multivariantVersionNeeds, versionFindings } from "./version";

export type MultivariantRule = (playlist: MultivariantPlaylist) => Finding[];

/**
 * Whether a variant carries video: from its codecs when they're known, otherwise from video-only
 * attributes. Undefined when nothing tells (no CODECS, no RESOLUTION, no FRAME-RATE).
 */
export function carriesVideo(variant: Variant): boolean | undefined {
  const kinds = (variant.codecs ?? [])
    .map((codec) => describeCodec(codec).kind)
    .filter((kind) => kind !== "unknown");
  if (kinds.length > 0) return kinds.includes("video");
  const hints = [variant.resolution, variant.frameRate, variant.video];
  return hints.some((hint) => hint !== undefined) ? true : undefined;
}

export const noVariants: MultivariantRule = (playlist) =>
  playlist.variants.length > 0
    ? []
    : [
        {
          id: "no-variants",
          severity: "error",
          message: "The playlist lists no variants (EXT-X-STREAM-INF).",
          detail: "A multivariant playlist without variants gives the player nothing to play.",
          ref: rfc8216("4.3.4.2"),
        },
      ];

export const missingCodecs: MultivariantRule = (playlist) =>
  playlist.variants
    .filter((variant) => variant.codecs === undefined || variant.codecs.length === 0)
    .map((variant) => ({
      id: "missing-codecs",
      severity: "warning",
      message: `${capitalize(variantNameWithBitrate(variant))} has no CODECS attribute.`,
      detail:
        "Without CODECS a player can't tell whether the device decodes a variant until it downloads a segment. It may pick a variant it can't play, or skip one it could. RFC 8216 says every EXT-X-STREAM-INF should list its codecs.",
      line: variant.line,
      ref: rfc8216("4.3.4.2"),
    }));

export const missingResolution: MultivariantRule = (playlist) =>
  playlist.variants
    .filter((variant) => carriesVideo(variant) === true && variant.resolution === undefined)
    .map((variant) => ({
      id: "missing-resolution",
      severity: "warning",
      message: `${capitalize(variantNameWithBitrate(variant))} carries video but has no RESOLUTION attribute.`,
      detail:
        "Players use RESOLUTION to skip variants larger than the screen and to choose where to start. Without it they may spend bandwidth on pixels nobody sees.",
      line: variant.line,
      ref: rfc8216("4.3.4.2"),
    }));

export const missingFrameRate: MultivariantRule = (playlist) =>
  playlist.variants
    .filter((variant) => carriesVideo(variant) === true && variant.frameRate === undefined)
    .map((variant) => ({
      id: "missing-frame-rate",
      severity: "note",
      message: `${capitalize(variantNameWithBitrate(variant))} has no FRAME-RATE attribute.`,
      detail:
        "Players use FRAME-RATE to avoid variants the device can't decode smoothly, such as 60 fps on a weak TV. Apple asks for it on every video variant; RFC 8216 asks for it above 30 fps.",
      line: variant.line,
      ref: APPLE_AUTHORING_SPEC,
    }));

export const averageBandwidthOverPeak: MultivariantRule = (playlist) =>
  playlist.variants.flatMap((variant): Finding[] => {
    const { bandwidth, averageBandwidth } = variant;
    if (bandwidth === undefined || averageBandwidth === undefined) return [];
    if (averageBandwidth <= bandwidth) return [];
    return [
      {
        id: "average-bandwidth-over-peak",
        severity: "error",
        message: `${capitalize(variantName(variant))} declares AVERAGE-BANDWIDTH ${formatInteger(averageBandwidth)}, more than its BANDWIDTH ${formatInteger(bandwidth)}.`,
        detail:
          "BANDWIDTH is the peak bit rate and AVERAGE-BANDWIDTH the average, so the average can't be higher. One of the two is wrong, and a player that picks variants by either number will misjudge what the network can carry.",
        line: variant.line,
        ref: rfc8216("4.3.4.2"),
      },
    ];
  });

export const missingMediaGroup: MultivariantRule = (playlist) => {
  const defined = new Set(playlist.renditions.map((r) => `${r.type} ${r.groupId}`));
  const missing = new Map<string, { type: RenditionType; groupId: string; lines: number[] }>();
  const check = (type: RenditionType, groupId: string | undefined, line: number): void => {
    if (groupId === undefined || defined.has(`${type} ${groupId}`)) return;
    const key = `${type} ${groupId}`;
    const entry = missing.get(key) ?? { type, groupId, lines: [] };
    entry.lines.push(line);
    missing.set(key, entry);
  };

  for (const variant of playlist.variants) {
    const captions = variant.closedCaptions;
    check("AUDIO", variant.audio, variant.line);
    check("VIDEO", variant.video, variant.line);
    check("SUBTITLES", variant.subtitles, variant.line);
    check(
      "CLOSED-CAPTIONS",
      captions?.type === "group" ? captions.groupId : undefined,
      variant.line,
    );
  }
  for (const variant of playlist.iFrameVariants) check("VIDEO", variant.video, variant.line);

  return [...missing.values()].map(({ type, groupId, lines }) => ({
    id: "missing-media-group",
    severity: "error",
    message: `${type}="${groupId}" is used by ${count(lines.length, "variant")}, but no EXT-X-MEDIA with TYPE=${type} has GROUP-ID="${groupId}".`,
    detail:
      "The player looks up this group to find the renditions to load with the variant. With no matching EXT-X-MEDIA there is nothing to load, so it may refuse the variant or play it without that track.",
    line: lines[0],
    ref: rfc8216("4.3.4.2"),
  }));
};

export const noIFramePlaylists: MultivariantRule = (playlist) => {
  const hasVideo = playlist.variants.some((variant) => carriesVideo(variant) === true);
  if (!hasVideo || playlist.iFrameVariants.length > 0) return [];
  return [
    {
      id: "no-i-frame-playlists",
      severity: "note",
      message: "The playlist has no I-frame playlists (EXT-X-I-FRAME-STREAM-INF).",
      detail:
        "I-frame playlists let a player show pictures while you scrub and play fast-forward and rewind. Without them, seeking shows a frozen frame until the new position loads. Apple requires them for video.",
      ref: APPLE_AUTHORING_SPEC,
    },
  ];
};

export const missingIndependentSegments: MultivariantRule = (playlist) =>
  playlist.variants.length === 0 || playlist.independentSegments
    ? []
    : [
        {
          id: "missing-independent-segments",
          severity: "note",
          message: "The playlist has no EXT-X-INDEPENDENT-SEGMENTS tag.",
          detail:
            "The tag promises that every segment starts with a key frame, so a player can switch quality at any segment boundary without fetching the segment before it. Apple asks for it in every multivariant playlist.",
          ref: APPLE_AUTHORING_SPEC,
        },
      ];

export const ladderGap: MultivariantRule = (playlist) => {
  const rungs: (Variant & { bandwidth: number })[] = [];
  for (const variant of playlist.variants) {
    const { bandwidth } = variant;
    if (bandwidth === undefined || carriesVideo(variant) === false) continue;
    if (rungs.some((rung) => rung.bandwidth === bandwidth)) continue;
    rungs.push({ ...variant, bandwidth });
  }
  rungs.sort((a, b) => a.bandwidth - b.bandwidth);

  return rungs.flatMap((higher, index): Finding[] => {
    const lower = rungs[index - 1];
    if (lower === undefined) return [];
    const ratio = higher.bandwidth / lower.bandwidth;
    if (ratio <= 2) return [];
    return [
      {
        id: "ladder-gap",
        severity: "note",
        message: `${capitalize(variantNameWithBitrate(higher))} is ${Number(ratio.toFixed(2))}× ${variantNameWithBitrate(lower)}, the next rung down; Apple recommends 1.5–2×.`,
        detail:
          "When neighbouring rungs are far apart, a player whose bandwidth falls between them has to drop to much lower quality, and each switch is a visible jump.",
        line: higher.line,
        ref: APPLE_AUTHORING_SPEC,
      },
    ];
  });
};

export const duplicateVariantUri: MultivariantRule = (playlist) => {
  const seen = new Map<string, Variant>();
  const findings: Finding[] = [];
  for (const variant of playlist.variants) {
    const captions = variant.closedCaptions;
    const key = JSON.stringify([
      variant.resolvedUri ?? variant.uri,
      variant.audio,
      variant.video,
      variant.subtitles,
      captions?.type === "group" ? captions.groupId : captions?.type,
      variant.pathwayId,
    ]);
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, variant);
      continue;
    }
    findings.push({
      id: "duplicate-variant-uri",
      severity: "warning",
      message: `The variant on line ${variant.line} repeats "${variant.uri}" from line ${first.line} with the same groups.`,
      detail:
        "Two variants with the same playlist and the same audio, video and subtitle groups are one choice listed twice. Players may count it twice when they build the quality list, and the copies' BANDWIDTH and CODECS can drift apart.",
      line: variant.line,
      ref: rfc8216("4.3.4.2"),
    });
  }
  return findings;
};

export const multivariantVersionTooLow: MultivariantRule = (playlist) =>
  versionFindings(
    playlist.version,
    playlist.tagLines["EXT-X-VERSION"] !== undefined,
    multivariantVersionNeeds(playlist),
  );
