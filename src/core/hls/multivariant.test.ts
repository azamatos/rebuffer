import { describe, expect, it } from "vitest";
import apple from "./fixtures/apple-multivariant.m3u8?raw";
import problems from "./fixtures/problems-multivariant.m3u8?raw";
import { lineOf, m3u8, messages, multivariantOf } from "./testing";

describe("parseMultivariant: an Apple-style playlist", () => {
  const playlist = multivariantOf(apple, { baseUrl: "https://media.example.com/film/master.m3u8" });

  it("reads the header tags without issues", () => {
    expect(playlist.issues).toEqual([]);
    expect(playlist.version).toBe(6);
    expect(playlist.independentSegments).toBe(true);
    expect(playlist.unknownTags).toEqual([]);
  });

  it("reads every variant with its URI and line", () => {
    expect(playlist.variants.map((variant) => [variant.line, variant.uri])).toEqual([
      [lineOf(apple, "BANDWIDTH=640000"), "v1/prog_index.m3u8"],
      [lineOf(apple, "BANDWIDTH=1200000"), "v2/prog_index.m3u8"],
      [lineOf(apple, "BANDWIDTH=2200000"), "v3/prog_index.m3u8"],
      [lineOf(apple, "BANDWIDTH=4100000"), "v4/prog_index.m3u8"],
      [lineOf(apple, "BANDWIDTH=7800000"), "v5/prog_index.m3u8"],
      [lineOf(apple, "BANDWIDTH=4500000"), "v4/prog_index.m3u8"],
      [lineOf(apple, "BANDWIDTH=8200000"), "v5/prog_index.m3u8"],
      [lineOf(apple, "BANDWIDTH=12000000"), "h1/prog_index.m3u8"],
    ]);
  });

  it("reads the attributes of a variant", () => {
    expect(playlist.variants[0]).toEqual({
      line: lineOf(apple, "BANDWIDTH=640000"),
      uri: "v1/prog_index.m3u8",
      resolvedUri: "https://media.example.com/film/v1/prog_index.m3u8",
      bandwidth: 640000,
      averageBandwidth: 520000,
      codecs: ["avc1.64001e", "mp4a.40.2"],
      resolution: { width: 640, height: 360 },
      frameRate: 30,
      audio: "aac",
      subtitles: "subs",
      closedCaptions: { type: "group", groupId: "cc" },
      attributes: {
        BANDWIDTH: "640000",
        "AVERAGE-BANDWIDTH": "520000",
        CODECS: "avc1.64001e,mp4a.40.2",
        RESOLUTION: "640x360",
        "FRAME-RATE": "30.000",
        AUDIO: "aac",
        SUBTITLES: "subs",
        "CLOSED-CAPTIONS": "cc",
      },
    });
  });

  it("reads HDR attributes and supplemental codecs", () => {
    expect(playlist.variants.at(-1)).toMatchObject({
      codecs: ["hvc1.2.4.L150.B0", "ec-3"],
      supplementalCodecs: ["dvh1.08.06/db4h"],
      resolution: { width: 3840, height: 2160 },
      frameRate: 24,
      hdcpLevel: "TYPE-1",
      videoRange: "PQ",
    });
  });

  it("reads audio, subtitle and closed-caption renditions", () => {
    expect(playlist.renditions.map((r) => [r.type, r.groupId, r.name, r.language])).toEqual([
      ["AUDIO", "aac", "English", "en"],
      ["AUDIO", "aac", "Deutsch", "de"],
      ["AUDIO", "ac3", "English", "en"],
      ["AUDIO", "ec3", "English", "en"],
      ["SUBTITLES", "subs", "English", "en"],
      ["SUBTITLES", "subs", "English (forced)", "en"],
      ["SUBTITLES", "subs", "English (SDH)", "en"],
      ["CLOSED-CAPTIONS", "cc", "English", "en"],
    ]);
    expect(playlist.renditions[3]).toMatchObject({ channels: "16/JOC", default: true });
    expect(playlist.renditions[5]).toMatchObject({
      forced: true,
      autoselect: false,
      default: false,
    });
    expect(playlist.renditions[6]?.characteristics).toEqual([
      "public.accessibility.transcribes-spoken-dialog",
      "public.accessibility.describes-music-and-sound",
    ]);
    expect(playlist.renditions[7]).toMatchObject({ instreamId: "CC1", uri: undefined });
    expect(playlist.renditions[0]?.resolvedUri).toBe(
      "https://media.example.com/film/audio/aac/en/prog_index.m3u8",
    );
  });

  it("reads I-frame playlists with the URI in their attributes", () => {
    expect(playlist.iFrameVariants).toHaveLength(3);
    expect(playlist.iFrameVariants[0]).toMatchObject({
      line: lineOf(apple, "v1/iframe_index"),
      uri: "v1/iframe_index.m3u8",
      bandwidth: 150000,
      averageBandwidth: 60000,
      codecs: ["avc1.64001e"],
      resolution: { width: 640, height: 360 },
    });
  });

  it("reads session data", () => {
    expect(playlist.sessionData).toEqual([
      {
        line: 4,
        dataId: "com.example.title",
        value: "Example film",
        language: "en",
        attributes: { "DATA-ID": "com.example.title", VALUE: "Example film", LANGUAGE: "en" },
      },
    ]);
  });
});

describe("parseMultivariant: other tags", () => {
  it("reads a variant without CODECS and keeps other attributes absent", () => {
    const variant = multivariantOf(problems).variants[2];
    expect(variant?.codecs).toBeUndefined();
    expect(variant?.averageBandwidth).toBeUndefined();
    expect(variant?.bandwidth).toBe(1600000);
  });

  it("reads CLOSED-CAPTIONS=NONE as no captions", () => {
    const playlist = multivariantOf(
      m3u8("#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=1,CLOSED-CAPTIONS=NONE", "a.m3u8"),
    );
    expect(playlist.variants[0]?.closedCaptions).toEqual({ type: "none" });
    expect(playlist.issues).toEqual([]);
  });

  it("reports an unquoted CLOSED-CAPTIONS group", () => {
    const playlist = multivariantOf(
      m3u8("#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=1,CLOSED-CAPTIONS=cc1", "a.m3u8"),
    );
    expect(playlist.variants[0]?.closedCaptions).toEqual({ type: "group", groupId: "cc1" });
    expect(messages(playlist)).toEqual([
      "EXT-X-STREAM-INF: CLOSED-CAPTIONS should be a quoted group id or NONE.",
    ]);
  });

  it("reads the remaining variant attributes", () => {
    const variant = multivariantOf(
      m3u8(
        "#EXTM3U",
        '#EXT-X-STREAM-INF:BANDWIDTH=1,VIDEO="cam",SCORE=1.5,STABLE-VARIANT-ID="hd",PATHWAY-ID="CDN-A",X-OWN=1',
        "a.m3u8",
      ),
    ).variants[0];
    expect(variant).toMatchObject({
      video: "cam",
      score: 1.5,
      stableVariantId: "hd",
      pathwayId: "CDN-A",
    });
    expect(variant?.attributes["X-OWN"]).toBe("1");
  });

  it("reads session keys and content steering", () => {
    const playlist = multivariantOf(
      m3u8(
        "#EXTM3U",
        '#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES,URI="skd://k1",KEYFORMAT="com.apple.streamingkeydelivery",KEYFORMATVERSIONS="1"',
        '#EXT-X-CONTENT-STEERING:SERVER-URI="/steering?video=1",PATHWAY-ID="CDN-A"',
        '#EXT-X-STREAM-INF:BANDWIDTH=1,PATHWAY-ID="CDN-A"',
        "a.m3u8",
      ),
      { baseUrl: "https://example.com/v/master.m3u8" },
    );
    expect(playlist.sessionKeys).toMatchObject([
      {
        line: 2,
        method: "SAMPLE-AES",
        uri: "skd://k1",
        keyFormat: "com.apple.streamingkeydelivery",
      },
    ]);
    expect(playlist.contentSteering).toMatchObject({
      line: 3,
      serverUri: "/steering?video=1",
      resolvedUri: "https://example.com/steering?video=1",
      pathwayId: "CDN-A",
    });
    expect(playlist.issues).toEqual([]);
  });

  it("reports a session key with METHOD=NONE and session data with both VALUE and URI", () => {
    const playlist = multivariantOf(
      m3u8(
        "#EXTM3U",
        "#EXT-X-SESSION-KEY:METHOD=NONE",
        '#EXT-X-SESSION-DATA:DATA-ID="a",VALUE="1",URI="a.json"',
        '#EXT-X-SESSION-DATA:VALUE="1"',
      ),
    );
    expect(playlist.sessionKeys).toEqual([]);
    expect(playlist.sessionData).toHaveLength(1);
    expect(messages(playlist)).toEqual([
      "EXT-X-SESSION-KEY: METHOD must not be NONE.",
      "EXT-X-SESSION-DATA: use either VALUE or URI, not both or neither.",
      "EXT-X-SESSION-DATA: DATA-ID is missing; it's required.",
    ]);
  });

  it("skips a variant without a URI line and a URI line without a variant", () => {
    const playlist = multivariantOf(
      m3u8(
        "#EXTM3U",
        "stray.m3u8",
        "#EXT-X-STREAM-INF:BANDWIDTH=1",
        "#EXT-X-STREAM-INF:BANDWIDTH=2",
        "b.m3u8",
        "#EXT-X-STREAM-INF:BANDWIDTH=3",
      ),
    );
    expect(playlist.variants.map((variant) => [variant.bandwidth, variant.uri])).toEqual([
      [2, "b.m3u8"],
    ]);
    expect(playlist.issues).toEqual([
      { line: 2, message: '"stray.m3u8" has no EXT-X-STREAM-INF before it; it\'s skipped.' },
      {
        line: 3,
        message: "EXT-X-STREAM-INF has no URI line after it; the variant is skipped.",
      },
      {
        line: 6,
        message: "EXT-X-STREAM-INF has no URI line after it; the variant is skipped.",
      },
    ]);
  });

  it("reports a variant without BANDWIDTH but keeps it", () => {
    const playlist = multivariantOf(
      m3u8("#EXTM3U", '#EXT-X-STREAM-INF:CODECS="avc1.640028"', "a.m3u8"),
    );
    expect(playlist.variants[0]?.bandwidth).toBeUndefined();
    expect(messages(playlist)).toEqual(["EXT-X-STREAM-INF: BANDWIDTH is missing; it's required."]);
  });

  it("skips renditions without a valid TYPE or GROUP-ID and I-frame playlists without URI", () => {
    const playlist = multivariantOf(
      m3u8(
        "#EXTM3U",
        '#EXT-X-MEDIA:TYPE=MUSIC,GROUP-ID="a",NAME="x"',
        '#EXT-X-MEDIA:TYPE=AUDIO,NAME="x"',
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a"',
        "#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1",
      ),
    );
    expect(playlist.renditions).toMatchObject([{ type: "AUDIO", groupId: "a", name: "" }]);
    expect(playlist.iFrameVariants).toEqual([]);
    expect(messages(playlist)).toEqual([
      'EXT-X-MEDIA: TYPE should be AUDIO, VIDEO, SUBTITLES or CLOSED-CAPTIONS; found "MUSIC".',
      "EXT-X-MEDIA: GROUP-ID is missing; it's required.",
      "EXT-X-MEDIA: NAME is missing; it's required.",
      "EXT-X-I-FRAME-STREAM-INF: URI is missing; it's required.",
    ]);
  });

  it("checks closed-caption renditions", () => {
    const playlist = multivariantOf(
      m3u8(
        "#EXTM3U",
        '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="English",URI="cc.m3u8"',
      ),
    );
    expect(messages(playlist)).toEqual([
      "EXT-X-MEDIA: INSTREAM-ID is required for CLOSED-CAPTIONS.",
      "EXT-X-MEDIA: CLOSED-CAPTIONS renditions must not have a URI.",
    ]);
  });
});
