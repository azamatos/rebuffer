import { describe, expect, it } from "vitest";
import { lintMedia } from "./lint";
import { m3u8, mediaOf } from "./testing";
import type { Finding } from "./types";

/** EXTINF and URI lines for MPEG-TS segments of the given durations. */
function segments(...durations: number[]): string[] {
  return durations.flatMap((duration, index) => [
    `#EXTINF:${duration.toFixed(3)},`,
    `s${index}.ts`,
  ]);
}

// Lines 1–4 of most test playlists; segments start at line 5, two lines each.
const HEAD = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:6", "#EXT-X-PLAYLIST-TYPE:VOD"];

function lint(...lines: string[]): Finding[] {
  return lintMedia(mediaOf(m3u8(...lines)));
}

function only(id: string, findings: Finding[]): Finding[] {
  return findings.filter((finding) => finding.id === id);
}

describe("a clean VOD playlist", () => {
  it("has no findings", () => {
    expect(lint(...HEAD, ...segments(6, 6, 6, 2.5), "#EXT-X-ENDLIST")).toEqual([]);
  });
});

describe("missing-target-duration", () => {
  it("flags a playlist without EXT-X-TARGETDURATION", () => {
    expect(
      only("missing-target-duration", lint("#EXTM3U", "#EXT-X-VERSION:3", ...segments(6))),
    ).toMatchObject([
      {
        severity: "error",
        message: "The playlist has no EXT-X-TARGETDURATION tag.",
      },
    ]);
  });
});

describe("segment-over-target", () => {
  it("flags each segment whose rounded duration exceeds the target, with its number and line", () => {
    const findings = lint(...HEAD, ...segments(6, 6.5, 6.49, 7.2), "#EXT-X-ENDLIST");
    const flagged = only("segment-over-target", findings);
    expect(flagged[0]?.detail).toContain("rounded to the nearest second");
    expect(flagged).toMatchObject([
      {
        severity: "error",
        message: "Segment 2 lasts 6.5 s; the target duration is 6 s.",
        line: 7,
        ref: {
          spec: "RFC 8216",
          section: "4.3.3.1",
          url: "https://www.rfc-editor.org/rfc/rfc8216#section-4.3.3.1",
        },
      },
      { message: "Segment 4 lasts 7.2 s; the target duration is 6 s.", line: 11 },
    ]);
  });

  it("passes segments that round down to the target", () => {
    expect(
      only("segment-over-target", lint(...HEAD, ...segments(6.49, 5.5), "#EXT-X-ENDLIST")),
    ).toEqual([]);
  });
});

describe("vod-without-endlist", () => {
  it("flags a VOD playlist without EXT-X-ENDLIST at its PLAYLIST-TYPE line", () => {
    expect(only("vod-without-endlist", lint(...HEAD, ...segments(6)))).toMatchObject([
      {
        severity: "error",
        message: "The playlist type is VOD, but there's no EXT-X-ENDLIST tag.",
        line: 4,
      },
    ]);
  });

  it("passes EVENT and live playlists without it", () => {
    const event = lint(
      "#EXTM3U",
      "#EXT-X-TARGETDURATION:6",
      "#EXT-X-PLAYLIST-TYPE:EVENT",
      ...segments(6),
    );
    const live = lint("#EXTM3U", "#EXT-X-TARGETDURATION:6", ...segments(6));
    expect(only("vod-without-endlist", [...event, ...live])).toEqual([]);
  });
});

describe("no-segments", () => {
  it("flags a playlist without segments", () => {
    expect(only("no-segments", lint(...HEAD, "#EXT-X-ENDLIST"))).toMatchObject([
      { severity: "error", message: "The playlist lists no segments." },
    ]);
  });
});

describe("long-target-duration", () => {
  it("notes a target duration over 10 s", () => {
    const findings = lint(
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:12",
      ...segments(12),
      "#EXT-X-ENDLIST",
    );
    expect(only("long-target-duration", findings)).toMatchObject([
      { severity: "note", message: "The target duration is 12 s; Apple recommends 6 s.", line: 3 },
    ]);
  });

  it("passes 10 s", () => {
    const findings = lint(
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:10",
      ...segments(10),
      "#EXT-X-ENDLIST",
    );
    expect(only("long-target-duration", findings)).toEqual([]);
  });
});

describe("mixed-containers", () => {
  it("warns when MPEG-TS and fMP4 segments mix, at the first switch", () => {
    const findings = lint(
      ...HEAD,
      ...segments(6, 6),
      "#EXT-X-DISCONTINUITY",
      '#EXT-X-MAP:URI="init.mp4"',
      "#EXTINF:6.000,",
      "s2.m4s",
      "#EXT-X-ENDLIST",
    );
    expect(only("mixed-containers", findings)).toMatchObject([
      {
        severity: "warning",
        message: "The playlist mixes containers: 2 MPEG-TS and 1 fMP4 segments.",
        line: 11,
      },
    ]);
  });

  it("passes a single container", () => {
    expect(only("mixed-containers", lint(...HEAD, ...segments(6, 6), "#EXT-X-ENDLIST"))).toEqual(
      [],
    );
  });
});

describe("uneven-segment-durations", () => {
  it("notes durations more than half the target apart, ignoring the last segment", () => {
    const findings = lint(...HEAD, ...segments(6, 2, 6, 6, 1), "#EXT-X-ENDLIST");
    expect(only("uneven-segment-durations", findings)).toMatchObject([
      {
        severity: "note",
        message:
          "Segment durations range from 2 s (segment 2) to 6 s (segment 1), more than half the 6 s target duration apart.",
        line: 7,
      },
    ]);
  });

  it("passes small differences and a short last segment", () => {
    expect(
      only("uneven-segment-durations", lint(...HEAD, ...segments(6, 4, 6, 1), "#EXT-X-ENDLIST")),
    ).toEqual([]);
  });
});

describe("key-none-with-attributes", () => {
  it("flags METHOD=NONE with other attributes", () => {
    const findings = lint(
      ...HEAD,
      '#EXT-X-KEY:METHOD=NONE,URI="key.bin"',
      ...segments(6),
      '#EXT-X-KEY:METHOD=NONE,URI="key.bin",IV=0x00000000000000000000000000000001',
      ...segments(6),
      "#EXT-X-ENDLIST",
    );
    expect(
      only("key-none-with-attributes", findings).map((finding) => [finding.line, finding.message]),
    ).toEqual([
      [5, "EXT-X-KEY has METHOD=NONE but also URI."],
      [8, "EXT-X-KEY has METHOD=NONE but also URI and IV."],
    ]);
  });

  it("passes METHOD=NONE alone", () => {
    const findings = lint(...HEAD, "#EXT-X-KEY:METHOD=NONE", ...segments(6), "#EXT-X-ENDLIST");
    expect(only("key-none-with-attributes", findings)).toEqual([]);
  });
});

describe("version-too-low (media)", () => {
  function versionMessages(...lines: string[]): string[] {
    return only("version-too-low", lint(...lines)).map(
      (finding) => `${finding.line}: ${finding.message}`,
    );
  }

  it("needs version 2 for IV and version 3 for decimal durations", () => {
    expect(
      versionMessages(
        "#EXTM3U",
        "#EXT-X-TARGETDURATION:6",
        '#EXT-X-KEY:METHOD=AES-128,URI="k",IV=0x00000000000000000000000000000001',
        "#EXTINF:6.0,",
        "a.ts",
      ),
    ).toEqual([
      "3: The IV attribute of EXT-X-KEY needs version 2; the playlist has no EXT-X-VERSION, so it counts as version 1.",
      "4: A decimal EXTINF duration needs version 3; the playlist has no EXT-X-VERSION, so it counts as version 1.",
    ]);
    expect(versionMessages("#EXTM3U", "#EXT-X-TARGETDURATION:6", "#EXTINF:6,", "a.ts")).toEqual([]);
  });

  it("needs version 4 for byte ranges and I-frame playlists", () => {
    expect(
      versionMessages(
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:6",
        "#EXT-X-I-FRAMES-ONLY",
        "#EXTINF:6,",
        "#EXT-X-BYTERANGE:100@0",
        "a.ts",
      ),
    ).toEqual([
      "4: EXT-X-I-FRAMES-ONLY needs version 4; the playlist declares version 3.",
      "6: EXT-X-BYTERANGE needs version 4; the playlist declares version 3.",
    ]);
  });

  it("needs version 5 for SAMPLE-AES, KEYFORMAT and EXT-X-MAP in I-frame playlists", () => {
    expect(
      versionMessages(
        "#EXTM3U",
        "#EXT-X-VERSION:4",
        "#EXT-X-TARGETDURATION:6",
        "#EXT-X-I-FRAMES-ONLY",
        '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://k",KEYFORMAT="com.apple.streamingkeydelivery"',
        '#EXT-X-MAP:URI="init.mp4"',
        "#EXTINF:6,",
        "a.m4s",
      ),
    ).toEqual([
      "5: METHOD=SAMPLE-AES in EXT-X-KEY needs version 5; the playlist declares version 4.",
      "5: The KEYFORMAT attribute of EXT-X-KEY needs version 5; the playlist declares version 4.",
      "6: EXT-X-MAP needs version 5; the playlist declares version 4.",
    ]);
  });

  it("needs version 6 for EXT-X-MAP outside I-frame playlists", () => {
    const lines = [
      "#EXTM3U",
      "#EXT-X-TARGETDURATION:6",
      '#EXT-X-MAP:URI="init.mp4"',
      "#EXTINF:6,",
      "a.m4s",
    ];
    expect(versionMessages(lines[0] ?? "", "#EXT-X-VERSION:5", ...lines.slice(1))).toEqual([
      "4: EXT-X-MAP outside an I-frame playlist needs version 6; the playlist declares version 5.",
    ]);
    expect(versionMessages(lines[0] ?? "", "#EXT-X-VERSION:6", ...lines.slice(1))).toEqual([]);
  });

  it("says when EXT-X-VERSION can't be read", () => {
    expect(
      versionMessages(
        "#EXTM3U",
        "#EXT-X-VERSION:three",
        "#EXT-X-TARGETDURATION:6",
        "#EXTINF:6.0,",
        "a.ts",
      ),
    ).toEqual([
      "4: A decimal EXTINF duration needs version 3; the playlist's EXT-X-VERSION isn't a whole number, so it counts as version 1.",
    ]);
  });
});
