import { type SegmentContainer, segmentContainer } from "./container";
import { APPLE_AUTHORING_SPEC, joinAnd, rfc8216 } from "./findings";
import { formatSeconds } from "./format";
import type { Finding, MediaPlaylist } from "./types";
import { mediaVersionNeeds, versionFindings } from "./version";

export type MediaRule = (playlist: MediaPlaylist) => Finding[];

const CONTAINER_NAMES: Record<SegmentContainer, string> = {
  ts: "MPEG-TS",
  fmp4: "fMP4",
  other: "other",
};

export const missingTargetDuration: MediaRule = (playlist) =>
  playlist.targetDuration !== undefined
    ? []
    : [
        {
          id: "missing-target-duration",
          severity: "error",
          message: "The playlist has no EXT-X-TARGETDURATION tag.",
          detail:
            "The target duration is required. Players use it to plan buffering and, for live streams, to decide how often to reload the playlist.",
          ref: rfc8216("4.3.3.1"),
        },
      ];

export const segmentOverTarget: MediaRule = (playlist) => {
  const target = playlist.targetDuration;
  if (target === undefined) return [];
  return playlist.segments.flatMap((segment, index): Finding[] =>
    Math.round(segment.duration) <= target
      ? []
      : [
          {
            id: "segment-over-target",
            severity: "error",
            message: `Segment ${index + 1} lasts ${formatSeconds(segment.duration)}; the target duration is ${formatSeconds(target)}.`,
            detail:
              "Every segment, rounded to the nearest second, must fit in the target duration. Players size their buffers and live reload timers from it, so a longer segment can make a live player fall behind or stall, and strict validators reject the playlist.",
            line: segment.line,
            ref: rfc8216("4.3.3.1"),
          },
        ],
  );
};

export const vodWithoutEndList: MediaRule = (playlist) =>
  playlist.playlistType !== "VOD" || playlist.endList
    ? []
    : [
        {
          id: "vod-without-endlist",
          severity: "error",
          message: "The playlist type is VOD, but there's no EXT-X-ENDLIST tag.",
          detail:
            "EXT-X-ENDLIST tells the player that no more segments will come. Without it, many players treat the stream as live: they keep reloading the playlist and may start near the end instead of at the beginning.",
          line: playlist.tagLines["EXT-X-PLAYLIST-TYPE"],
          ref: rfc8216("4.3.3.5"),
        },
      ];

export const noSegments: MediaRule = (playlist) =>
  playlist.segments.length > 0
    ? []
    : [
        {
          id: "no-segments",
          severity: "error",
          message: "The playlist lists no segments.",
          detail:
            "A media playlist without segments gives the player nothing to load. A live stream that starts like this stalls until segments appear.",
          ref: rfc8216("4.3.2"),
        },
      ];

export const longTargetDuration: MediaRule = (playlist) => {
  const target = playlist.targetDuration;
  if (target === undefined || target <= 10) return [];
  return [
    {
      id: "long-target-duration",
      severity: "note",
      message: `The target duration is ${formatSeconds(target)}; Apple recommends 6 s.`,
      detail:
        "Long segments make a player wait longer before it can start or switch quality, and keep live streams further behind real time.",
      line: playlist.tagLines["EXT-X-TARGETDURATION"],
      ref: APPLE_AUTHORING_SPEC,
    },
  ];
};

export const mixedContainers: MediaRule = (playlist) => {
  if (playlist.container !== "mixed") return [];
  const kinds = playlist.segments.map(segmentContainer);
  const counts = new Map<SegmentContainer, number>();
  for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  const firstSwitch = kinds.findIndex((kind) => kind !== kinds[0]);
  const parts = [...counts].map(([kind, amount]) => `${amount} ${CONTAINER_NAMES[kind]}`);
  return [
    {
      id: "mixed-containers",
      severity: "warning",
      message: `The playlist mixes containers: ${joinAnd(parts)} segments.`,
      detail:
        "A change of container makes the player reset its demuxer. RFC 8216 requires an EXT-X-DISCONTINUITY at such a change, and many players still stall or glitch there.",
      line: playlist.segments[firstSwitch]?.line,
      ref: rfc8216("4.3.2.3"),
    },
  ];
};

export const unevenSegmentDurations: MediaRule = (playlist) => {
  const target = playlist.targetDuration;
  // The last segment may be shorter, so it doesn't count.
  const segments = playlist.segments.slice(0, -1);
  if (target === undefined || segments.length < 2) return [];

  let shortest = 0;
  let longest = 0;
  segments.forEach((segment, index) => {
    if (segment.duration < (segments[shortest]?.duration ?? 0)) shortest = index;
    if (segment.duration > (segments[longest]?.duration ?? 0)) longest = index;
  });
  const min = segments[shortest];
  const max = segments[longest];
  if (min === undefined || max === undefined || max.duration - min.duration <= target / 2)
    return [];

  return [
    {
      id: "uneven-segment-durations",
      severity: "note",
      message: `Segment durations range from ${formatSeconds(min.duration)} (segment ${shortest + 1}) to ${formatSeconds(max.duration)} (segment ${longest + 1}), more than half the ${formatSeconds(target)} target duration apart.`,
      detail:
        "Uneven segments make a player's bandwidth estimates noisy and its buffer level jumpy. They usually mean key frames don't line up with segment boundaries; Apple recommends equal segments, with only the last one shorter.",
      line: min.line,
      ref: APPLE_AUTHORING_SPEC,
    },
  ];
};

export const keyNoneWithAttributes: MediaRule = (playlist) =>
  playlist.keys.flatMap((key): Finding[] => {
    const extra = Object.keys(key.attributes).filter((name) => name !== "METHOD");
    if (key.method !== "NONE" || extra.length === 0) return [];
    return [
      {
        id: "key-none-with-attributes",
        severity: "error",
        message: `EXT-X-KEY has METHOD=NONE but also ${joinAnd(extra)}.`,
        detail:
          "METHOD=NONE means the segments that follow aren't encrypted, so no other attribute may be present. A player may still try to fetch the key, and the tag's meaning becomes unclear.",
        line: key.line,
        ref: rfc8216("4.3.2.4"),
      },
    ];
  });

export const mediaVersionTooLow: MediaRule = (playlist) =>
  versionFindings(
    playlist.version,
    playlist.tagLines["EXT-X-VERSION"] !== undefined,
    mediaVersionNeeds(playlist),
  );
