import { describe, expect, it } from "vitest";
import { lintMultivariant } from "./lint";
import { carriesVideo } from "./rules-multivariant";
import { m3u8, multivariantOf } from "./testing";
import type { Finding } from "./types";

// Lines 1–3 of every test playlist; the lines a test passes start at line 4.
const HEAD = ["#EXTM3U", "#EXT-X-VERSION:6", "#EXT-X-INDEPENDENT-SEGMENTS"];
const I_FRAMES =
  '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=200000,CODECS="avc1.64001f",RESOLUTION=960x540,URI="i.m3u8"';
const RUNG_540 =
  '#EXT-X-STREAM-INF:BANDWIDTH=1400000,AVERAGE-BANDWIDTH=1200000,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=960x540,FRAME-RATE=25';
const RUNG_720 =
  '#EXT-X-STREAM-INF:BANDWIDTH=2800000,AVERAGE-BANDWIDTH=2400000,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=1280x720,FRAME-RATE=25';

/** Lints HEAD + lines + an I-frame playlist. */
function lint(...lines: string[]): Finding[] {
  return lintMultivariant(multivariantOf(m3u8(...HEAD, ...lines, I_FRAMES)));
}

function only(id: string, findings: Finding[]): Finding[] {
  return findings.filter((finding) => finding.id === id);
}

describe("a clean ladder", () => {
  it("has no findings", () => {
    expect(lint(RUNG_540, "540.m3u8", RUNG_720, "720.m3u8")).toEqual([]);
  });
});

describe("no-variants", () => {
  it("flags a playlist without EXT-X-STREAM-INF", () => {
    expect(only("no-variants", lint())).toMatchObject([
      { severity: "error", message: "The playlist lists no variants (EXT-X-STREAM-INF)." },
    ]);
  });
});

describe("missing-codecs", () => {
  it("flags each variant without CODECS", () => {
    const findings = lint(
      "#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,FRAME-RATE=25",
      "720.m3u8",
      '#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="",RESOLUTION=1920x1080,FRAME-RATE=25',
      "1080.m3u8",
    );
    const flagged = only("missing-codecs", findings);
    expect(flagged[0]?.detail).toContain("can't tell whether the device decodes");
    expect(flagged).toMatchObject([
      {
        severity: "warning",
        message: "720p (2.8 Mbps) has no CODECS attribute.",
        line: 4,
        ref: {
          spec: "RFC 8216",
          section: "4.3.4.2",
          url: "https://www.rfc-editor.org/rfc/rfc8216#section-4.3.4.2",
        },
      },
      { message: "1080p (5 Mbps) has no CODECS attribute.", line: 6 },
    ]);
  });

  it("passes variants with CODECS", () => {
    expect(only("missing-codecs", lint(RUNG_720, "720.m3u8"))).toEqual([]);
  });
});

describe("missing-resolution", () => {
  it("flags a video variant without RESOLUTION", () => {
    const findings = lint(
      '#EXT-X-STREAM-INF:BANDWIDTH=2800000,CODECS="avc1.64001f,mp4a.40.2",FRAME-RATE=25',
      "a.m3u8",
    );
    expect(only("missing-resolution", findings)).toMatchObject([
      {
        severity: "warning",
        message: "The 2.8 Mbps variant on line 4 carries video but has no RESOLUTION attribute.",
        line: 4,
      },
    ]);
  });

  it("passes audio-only variants and variants it can't tell", () => {
    const findings = lint(
      '#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"',
      "audio.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=2800000",
      "unknown.m3u8",
    );
    expect(only("missing-resolution", findings)).toEqual([]);
  });
});

describe("missing-frame-rate", () => {
  it("notes a video variant without FRAME-RATE", () => {
    const findings = lint(
      '#EXT-X-STREAM-INF:BANDWIDTH=2800000,CODECS="avc1.64001f",RESOLUTION=1280x720',
      "a.m3u8",
    );
    expect(only("missing-frame-rate", findings)).toMatchObject([
      {
        severity: "note",
        message: "720p (2.8 Mbps) has no FRAME-RATE attribute.",
        ref: { spec: "Apple HLS authoring spec" },
      },
    ]);
  });

  it("passes audio-only variants", () => {
    const findings = lint('#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"', "audio.m3u8");
    expect(only("missing-frame-rate", findings)).toEqual([]);
  });
});

describe("average-bandwidth-over-peak", () => {
  it("flags AVERAGE-BANDWIDTH above BANDWIDTH", () => {
    const findings = lint(
      '#EXT-X-STREAM-INF:BANDWIDTH=2800000,AVERAGE-BANDWIDTH=3000000,CODECS="avc1.64001f",RESOLUTION=1280x720,FRAME-RATE=25',
      "a.m3u8",
    );
    expect(only("average-bandwidth-over-peak", findings)).toMatchObject([
      {
        severity: "error",
        message: "720p declares AVERAGE-BANDWIDTH 3,000,000, more than its BANDWIDTH 2,800,000.",
        line: 4,
      },
    ]);
  });

  it("passes an equal average", () => {
    const findings = lint(
      '#EXT-X-STREAM-INF:BANDWIDTH=2800000,AVERAGE-BANDWIDTH=2800000,CODECS="avc1.64001f",RESOLUTION=1280x720,FRAME-RATE=25',
      "a.m3u8",
    );
    expect(only("average-bandwidth-over-peak", findings)).toEqual([]);
  });
});

describe("missing-media-group", () => {
  it("flags each group used without a matching EXT-X-MEDIA, once per group", () => {
    const findings = lint(
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="aac",NAME="English",URI="s.m3u8"',
      `${RUNG_540},AUDIO="aac",SUBTITLES="subs",CLOSED-CAPTIONS="cc"`,
      "540.m3u8",
      `${RUNG_720},AUDIO="aac",CLOSED-CAPTIONS=NONE`,
      "720.m3u8",
    );
    expect(
      only("missing-media-group", findings).map((finding) => [finding.line, finding.message]),
    ).toEqual([
      [
        5,
        'AUDIO="aac" is used by 2 variants, but no EXT-X-MEDIA with TYPE=AUDIO has GROUP-ID="aac".',
      ],
      [
        5,
        'CLOSED-CAPTIONS="cc" is used by 1 variant, but no EXT-X-MEDIA with TYPE=CLOSED-CAPTIONS has GROUP-ID="cc".',
      ],
      [
        5,
        'SUBTITLES="subs" is used by 1 variant, but no EXT-X-MEDIA with TYPE=SUBTITLES has GROUP-ID="subs".',
      ],
    ]);
  });

  it("checks the VIDEO group of I-frame playlists", () => {
    const text = m3u8(
      ...HEAD,
      RUNG_720,
      "720.m3u8",
      '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1,VIDEO="cam",URI="i.m3u8"',
    );
    expect(only("missing-media-group", lintMultivariant(multivariantOf(text)))).toMatchObject([
      {
        line: 6,
        message:
          'VIDEO="cam" is used by 1 variant, but no EXT-X-MEDIA with TYPE=VIDEO has GROUP-ID="cam".',
      },
    ]);
  });

  it("passes groups that exist", () => {
    const findings = lint(
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",URI="a.m3u8"',
      '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="English",INSTREAM-ID="CC1"',
      `${RUNG_720},AUDIO="aac",CLOSED-CAPTIONS="cc"`,
      "720.m3u8",
    );
    expect(only("missing-media-group", findings)).toEqual([]);
  });
});

describe("no-i-frame-playlists", () => {
  it("notes a video ladder without I-frame playlists", () => {
    const playlist = multivariantOf(m3u8(...HEAD, RUNG_720, "720.m3u8"));
    expect(only("no-i-frame-playlists", lintMultivariant(playlist))).toMatchObject([
      { severity: "note", ref: { spec: "Apple HLS authoring spec" } },
    ]);
  });

  it("passes audio-only playlists", () => {
    const playlist = multivariantOf(
      m3u8(...HEAD, '#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"', "audio.m3u8"),
    );
    expect(only("no-i-frame-playlists", lintMultivariant(playlist))).toEqual([]);
  });
});

describe("missing-independent-segments", () => {
  it("notes a playlist without the tag", () => {
    const playlist = multivariantOf(m3u8("#EXTM3U", RUNG_720, "720.m3u8", I_FRAMES));
    expect(only("missing-independent-segments", lintMultivariant(playlist))).toMatchObject([
      { severity: "note", message: "The playlist has no EXT-X-INDEPENDENT-SEGMENTS tag." },
    ]);
  });

  it("passes a playlist with the tag", () => {
    expect(only("missing-independent-segments", lint(RUNG_720, "720.m3u8"))).toEqual([]);
  });
});

describe("ladder-gap", () => {
  const rung = (bandwidth: number, height: number): string =>
    `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=${(height * 16) / 9}x${height},FRAME-RATE=25`;

  it("notes neighbouring rungs more than 2× apart, sorted by bandwidth", () => {
    const findings = lint(
      rung(6_000_000, 1080),
      "1080.m3u8",
      rung(1_000_000, 540),
      "540.m3u8",
      rung(2_500_000, 720),
      "720.m3u8",
    );
    expect(only("ladder-gap", findings)).toMatchObject([
      {
        severity: "note",
        message:
          "1080p (6 Mbps) is 2.4× 720p (2.5 Mbps), the next rung down; Apple recommends 1.5–2×.",
        line: 4,
      },
      {
        message:
          "720p (2.5 Mbps) is 2.5× 540p (1 Mbps), the next rung down; Apple recommends 1.5–2×.",
        line: 8,
      },
    ]);
  });

  it("passes rungs exactly 2× apart, repeated rungs and audio-only rungs", () => {
    const findings = lint(
      '#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS="mp4a.40.5"',
      "audio.m3u8",
      rung(1_000_000, 540),
      "540.m3u8",
      rung(2_000_000, 720),
      "720.m3u8",
      `${rung(2_000_000, 720)},AUDIO="other"`,
      "720.m3u8",
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="other",NAME="Other",URI="o.m3u8"',
    );
    expect(only("ladder-gap", findings)).toEqual([]);
  });
});

describe("duplicate-variant-uri", () => {
  it("flags a URI repeated with the same groups", () => {
    const findings = lint(RUNG_720, "720.m3u8", RUNG_540, "720.m3u8");
    expect(only("duplicate-variant-uri", findings)).toMatchObject([
      {
        severity: "warning",
        message: 'The variant on line 6 repeats "720.m3u8" from line 4 with the same groups.',
        line: 6,
      },
    ]);
  });

  it("passes the same video with different audio groups, as Apple's examples do", () => {
    const findings = lint(
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",URI="aac.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="ac3",NAME="English",URI="ac3.m3u8"',
      `${RUNG_720},AUDIO="aac"`,
      "720.m3u8",
      `${RUNG_720},AUDIO="ac3"`,
      "720.m3u8",
    );
    expect(only("duplicate-variant-uri", findings)).toEqual([]);
  });
});

describe("version-too-low (multivariant)", () => {
  const service =
    '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="English",INSTREAM-ID="SERVICE1"';

  it("flags INSTREAM-ID SERVICE values below version 7", () => {
    expect(
      only("version-too-low", lint(service, `${RUNG_720},CLOSED-CAPTIONS="cc"`, "720.m3u8")),
    ).toMatchObject([
      {
        severity: "error",
        message: 'INSTREAM-ID="SERVICE1" needs version 7; the playlist declares version 6.',
        line: 4,
        ref: {
          spec: "RFC 8216",
          section: "7",
          url: "https://www.rfc-editor.org/rfc/rfc8216#section-7",
        },
      },
    ]);
  });

  it("says when the playlist has no EXT-X-VERSION", () => {
    const playlist = multivariantOf(
      m3u8("#EXTM3U", service, `${RUNG_720},CLOSED-CAPTIONS="cc"`, "720.m3u8"),
    );
    expect(only("version-too-low", lintMultivariant(playlist))[0]?.message).toBe(
      'INSTREAM-ID="SERVICE1" needs version 7; the playlist has no EXT-X-VERSION, so it counts as version 1.',
    );
  });

  it("passes version 7 and CC1 values", () => {
    const playlist = multivariantOf(
      m3u8("#EXTM3U", "#EXT-X-VERSION:7", service, RUNG_720, "720.m3u8"),
    );
    expect(only("version-too-low", lintMultivariant(playlist))).toEqual([]);
    const cc1 = service.replace("SERVICE1", "CC1");
    expect(only("version-too-low", lint(cc1, RUNG_720, "720.m3u8"))).toEqual([]);
  });
});

describe("carriesVideo", () => {
  const base = { line: 1, uri: "a.m3u8", attributes: {} };

  it("reads codecs first, then video-only attributes", () => {
    expect(carriesVideo({ ...base, codecs: ["avc1.640028", "mp4a.40.2"] })).toBe(true);
    expect(
      carriesVideo({ ...base, codecs: ["mp4a.40.2"], resolution: { width: 1, height: 1 } }),
    ).toBe(false);
    expect(carriesVideo({ ...base, codecs: ["xyz"], resolution: { width: 1, height: 1 } })).toBe(
      true,
    );
    expect(carriesVideo({ ...base, frameRate: 25 })).toBe(true);
    expect(carriesVideo(base)).toBeUndefined();
  });
});
