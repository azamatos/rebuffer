import { describe, expect, it } from "vitest";
import { playlistContainer, segmentContainer } from "./container";
import encrypted from "./fixtures/encrypted.m3u8?raw";
import fmp4Vod from "./fixtures/fmp4-vod.m3u8?raw";
import live from "./fixtures/live.m3u8?raw";
import llHls from "./fixtures/ll-hls.m3u8?raw";
import problems from "./fixtures/problems-media.m3u8?raw";
import { lineOf, m3u8, mediaOf, messages } from "./testing";

describe("parseMedia: an fMP4 VOD playlist with byte ranges", () => {
  const playlist = mediaOf(fmp4Vod, { baseUrl: "https://media.example.com/film/720/index.m3u8" });

  it("reads the header tags", () => {
    expect(playlist).toMatchObject({
      version: 7,
      targetDuration: 4,
      mediaSequence: 1,
      playlistType: "VOD",
      endList: true,
      independentSegments: true,
      iFramesOnly: false,
      container: "fmp4",
      totalDuration: 15.2,
    });
    expect(playlist.issues).toEqual([]);
  });

  it("continues byte ranges from the previous range of the same file", () => {
    expect(playlist.segments.map((segment) => segment.byteRange)).toEqual([
      { length: 1532810, offset: 1012 },
      { length: 1398001, offset: 1012 + 1532810 },
      { length: 1450212, offset: 1012 + 1532810 + 1398001 },
      { length: 1102466, offset: 1012 + 1532810 + 1398001 + 1450212 },
    ]);
  });

  it("attaches the EXT-X-MAP to every segment after it", () => {
    const map = {
      line: 7,
      uri: "video_720p.mp4",
      resolvedUri: "https://media.example.com/film/720/video_720p.mp4",
      byteRange: { length: 1012, offset: 0 },
      attributes: { URI: "video_720p.mp4", BYTERANGE: "1012@0" },
    };
    for (const segment of playlist.segments) expect(segment.map).toEqual(map);
  });

  it("numbers segments and adds up their start times", () => {
    expect(
      playlist.segments.map((segment) => [
        segment.line,
        segment.mediaSequence,
        segment.startTime,
        segment.duration,
      ]),
    ).toEqual([
      [8, 1, 0, 4],
      [11, 2, 4, 4],
      [14, 3, 8, 4],
      [17, 4, 12, 3.2],
    ]);
  });
});

describe("parseMedia: an MPEG-TS playlist", () => {
  const playlist = mediaOf(problems);

  it("reads every segment, including the long one", () => {
    expect(playlist.segments).toHaveLength(15);
    expect(playlist.segments[11]).toMatchObject({
      uri: "segment_011.ts",
      duration: 6.6,
      line: lineOf(problems, "#EXTINF:6.600000"),
      mediaSequence: 11,
      startTime: 66,
    });
    expect(playlist.container).toBe("ts");
    expect(playlist.totalDuration).toBe(88);
    expect(playlist.firstDecimalDurationLine).toBe(6);
  });

  it("avoids floating-point noise in start times", () => {
    const text = m3u8("#EXTM3U", ...Array.from({ length: 10 }, (_, i) => `#EXTINF:0.1,\n${i}.ts`));
    const playlist = mediaOf(text);
    expect(playlist.segments.at(-1)?.startTime).toBe(0.9);
    expect(playlist.totalDuration).toBe(1);
  });
});

describe("parseMedia: a live playlist", () => {
  const playlist = mediaOf(live);

  it("reads the sliding window", () => {
    expect(playlist).toMatchObject({
      mediaSequence: 2680,
      discontinuitySequence: 3,
      endList: false,
      playlistType: undefined,
    });
    expect(playlist.issues).toEqual([]);
  });

  it("numbers segments from the media and discontinuity sequences", () => {
    expect(
      playlist.segments.map((segment) => [
        segment.uri,
        segment.mediaSequence,
        segment.discontinuity,
        segment.discontinuitySequence,
      ]),
    ).toEqual([
      ["live/2680.ts", 2680, false, 3],
      ["live/2681.ts", 2681, false, 3],
      ["live/2682.ts", 2682, true, 4],
      ["live/2683.ts", 2683, false, 4],
      ["live/2684.ts", 2684, false, 4],
    ]);
  });

  it("attaches program date-times only where the playlist has them", () => {
    expect(playlist.segments.map((segment) => segment.programDateTime)).toEqual([
      "2026-10-18T12:00:00.000Z",
      undefined,
      "2026-10-18T12:00:30.000Z",
      undefined,
      undefined,
    ]);
  });

  it("records date ranges and keeps unknown tags", () => {
    expect(playlist.dateRanges).toEqual([
      expect.objectContaining({
        line: lineOf(live, "EXT-X-DATERANGE"),
        id: "break-1",
        class: "com.example.break",
        startDate: "2026-10-18T12:00:34.000Z",
        plannedDuration: 30,
        endOnNext: false,
      }),
    ]);
    expect(playlist.dateRanges[0]?.attributes["SCTE35-OUT"]).toMatch(/^0xFC30/);
    expect(playlist.unknownTags).toEqual([
      { line: lineOf(live, "CUE-OUT"), tag: "EXT-X-CUE-OUT", value: "30" },
    ]);
  });

  it("doesn't count a discontinuity before the first segment", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        "#EXT-X-DISCONTINUITY-SEQUENCE:7",
        "#EXT-X-DISCONTINUITY",
        "#EXTINF:4,",
        "a.ts",
      ),
    );
    expect(playlist.segments[0]).toMatchObject({ discontinuity: true, discontinuitySequence: 7 });
  });
});

describe("parseMedia: keys", () => {
  const playlist = mediaOf(encrypted, { baseUrl: "https://media.example.com/film/index.m3u8" });

  it("applies each EXT-X-KEY to the segments after it until the next one", () => {
    expect(
      playlist.segments.map((segment) => [segment.uri, segment.key?.method, segment.key?.uri]),
    ).toEqual([
      ["seg1.ts", "AES-128", "https://keys.example.com/k1"],
      ["seg2.ts", "AES-128", "https://keys.example.com/k1"],
      ["seg3.ts", "AES-128", "k2.bin"],
      ["seg4.ts", undefined, undefined],
      ["seg5.ts", "SAMPLE-AES", "skd://k3"],
    ]);
    expect(playlist.issues).toEqual([]);
  });

  it("reads the key attributes", () => {
    expect(playlist.segments[2]?.key).toMatchObject({
      line: lineOf(encrypted, "k2.bin"),
      resolvedUri: "https://media.example.com/film/k2.bin",
      iv: "0x0000000000000000000000000000000A",
    });
    expect(playlist.segments[4]?.key).toMatchObject({
      keyFormat: "com.apple.streamingkeydelivery",
      keyFormatVersions: "1",
    });
  });

  it("lists every EXT-X-KEY tag, including METHOD=NONE", () => {
    expect(playlist.keys.map((key) => key.method)).toEqual([
      "AES-128",
      "AES-128",
      "NONE",
      "SAMPLE-AES",
    ]);
  });

  it("keeps keys of different KEYFORMATs side by side", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://a",KEYFORMAT="com.apple.streamingkeydelivery"',
        '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="data:text/plain;base64,AAAA",KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
        "#EXTINF:4,",
        "a.ts",
        '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="data:text/plain;base64,BBBB",KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
        "#EXTINF:4,",
        "b.ts",
      ),
    );
    expect(playlist.segments.map((segment) => segment.key?.uri)).toEqual(["skd://a", "skd://a"]);
    expect(playlist.keys).toHaveLength(3);
  });

  it("reports keys without METHOD, without URI, with an unknown method or a short IV", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        '#EXT-X-KEY:URI="k"',
        "#EXT-X-KEY:METHOD=AES-128",
        '#EXT-X-KEY:METHOD=AES-256,URI="k"',
        '#EXT-X-KEY:METHOD=AES-128,URI="k",IV=0x1234',
      ),
    );
    expect(playlist.keys).toHaveLength(3);
    expect(messages(playlist)).toEqual([
      "EXT-X-KEY: METHOD is missing; it's required.",
      "EXT-X-KEY: URI is missing; METHOD=AES-128 needs one.",
      "EXT-X-KEY: METHOD=AES-256 isn't a method RFC 8216 defines.",
      "EXT-X-KEY: IV should have 32 hexadecimal digits (128 bits); it has 4.",
    ]);
  });
});

describe("parseMedia: low-latency HLS", () => {
  const playlist = mediaOf(llHls);

  it("reads server control and the part target", () => {
    expect(playlist.issues).toEqual([]);
    expect(playlist.serverControl).toMatchObject({
      line: 4,
      canBlockReload: true,
      canSkipUntil: 24,
      canSkipDateRanges: false,
      partHoldBack: 3.012,
      holdBack: undefined,
    });
    expect(playlist.partInfo).toMatchObject({ line: 5, partTarget: 1.004 });
  });

  it("gives each part the media sequence number of its segment", () => {
    expect(
      playlist.parts.map((part) => [part.uri, part.mediaSequence, part.independent, part.duration]),
    ).toEqual([
      ["filePart268.0.mp4", 268, true, 1.00001],
      ["filePart268.1.mp4", 268, false, 1.00001],
      ["filePart268.2.mp4", 268, true, 1.00001],
      ["filePart268.3.mp4", 268, false, 1.00001],
      ["filePart269.0.mp4", 269, true, 1.00001],
    ]);
    expect(playlist.segments.map((segment) => segment.mediaSequence)).toEqual([266, 267, 268]);
  });

  it("records preload hints and rendition reports", () => {
    expect(playlist.preloadHints).toMatchObject([
      { line: lineOf(llHls, "PRELOAD-HINT"), type: "PART", uri: "filePart269.1.mp4" },
    ]);
    expect(playlist.renditionReports).toMatchObject([
      { uri: "../1M/waitForMSN.php", lastMsn: 269, lastPart: 0 },
      { uri: "../4M/waitForMSN.php", lastMsn: 269, lastPart: 0 },
    ]);
  });

  it("starts numbering after skipped segments in a delta update", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        "#EXT-X-TARGETDURATION:4",
        "#EXT-X-MEDIA-SEQUENCE:100",
        '#EXT-X-SKIP:SKIPPED-SEGMENTS=20,RECENTLY-REMOVED-DATERANGES="ad-1\tad-2"',
        "#EXTINF:4,",
        "120.m4s",
      ),
    );
    expect(playlist.skip).toMatchObject({
      skippedSegments: 20,
      recentlyRemovedDateRanges: ["ad-1", "ad-2"],
    });
    expect(playlist.segments[0]?.mediaSequence).toBe(120);
  });

  it("records part byte ranges and preload hint ranges", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        '#EXT-X-PART:DURATION=0.5,URI="all.mp4",BYTERANGE="5000@100",GAP=YES',
        '#EXT-X-PART:DURATION=0.5,URI="all.mp4",BYTERANGE="4000"',
        '#EXT-X-PRELOAD-HINT:TYPE=PART,URI="all.mp4",BYTERANGE-START=9100,BYTERANGE-LENGTH=4000',
      ),
    );
    expect(playlist.parts.map((part) => [part.byteRange, part.gap])).toEqual([
      [{ length: 5000, offset: 100 }, true],
      [{ length: 4000 }, false],
    ]);
    expect(playlist.preloadHints[0]).toMatchObject({ byteRangeStart: 9100, byteRangeLength: 4000 });
  });
});

describe("parseMedia: segment tags", () => {
  it("reads the EXTINF title, which may contain commas", () => {
    const playlist = mediaOf(m3u8("#EXTM3U", "#EXTINF:10.5,Intro, part 1", "a.ts"));
    expect(playlist.segments[0]).toMatchObject({ duration: 10.5, title: "Intro, part 1" });
  });

  it("reports an EXTINF without a comma or with text after the duration, and uses the number", () => {
    const playlist = mediaOf(m3u8("#EXTM3U", "#EXTINF:6", "a.ts", "#EXTINF:6.0 sec,", "b.ts"));
    expect(playlist.segments.map((segment) => segment.duration)).toEqual([6, 6]);
    expect(messages(playlist)).toEqual([
      "EXTINF: a comma should follow the duration.",
      "EXTINF: unexpected text after the duration: sec",
    ]);
  });

  it("reports an EXTINF with no URI before the next EXTINF", () => {
    const playlist = mediaOf(m3u8("#EXTM3U", "#EXTINF:6,", "#EXTINF:5,", "a.ts"));
    expect(playlist.segments).toMatchObject([{ duration: 5, line: 3 }]);
    expect(playlist.issues).toEqual([{ line: 2, message: "EXTINF has no URI line after it." }]);
  });

  it("marks gaps and attaches EXT-X-BITRATE until the next one, except to byte ranges", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        "#EXT-X-BITRATE:1500",
        "#EXTINF:4,",
        "a.ts",
        "#EXT-X-GAP",
        "#EXTINF:4,",
        "b.ts",
        "#EXTINF:4,",
        "#EXT-X-BYTERANGE:100@0",
        "c.ts",
        "#EXT-X-BITRATE:900",
        "#EXTINF:4,",
        "d.ts",
      ),
    );
    expect(playlist.segments.map((segment) => [segment.uri, segment.gap, segment.bitrate])).toEqual(
      [
        ["a.ts", false, 1500],
        ["b.ts", true, 1500],
        ["c.ts", false, undefined],
        ["d.ts", false, 900],
      ],
    );
  });

  it("continues a byte range without offset from the last range of the same file", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        "#EXTINF:4,",
        "#EXT-X-BYTERANGE:100@50",
        "main.ts",
        "#EXTINF:4,",
        "#EXT-X-BYTERANGE:200@0",
        "other.ts",
        "#EXTINF:4,",
        "#EXT-X-BYTERANGE:300",
        "main.ts",
      ),
    );
    expect(playlist.segments.map((segment) => segment.byteRange)).toEqual([
      { length: 100, offset: 50 },
      { length: 200, offset: 0 },
      { length: 300, offset: 150 },
    ]);
    expect(playlist.issues).toEqual([
      {
        line: 9,
        message:
          'EXT-X-BYTERANGE has no offset, but the previous segment isn\'t a range of "main.ts"; it continues from byte 150.',
      },
    ]);
  });

  it("reports a malformed byte range and program date-time", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        "#EXT-X-BYTERANGE:100-200",
        "#EXT-X-PROGRAM-DATE-TIME:yesterday",
        '#EXT-X-MAP:URI="init.mp4",BYTERANGE="all"',
        "#EXTINF:4,",
        "a.m4s",
      ),
    );
    expect(playlist.segments[0]?.byteRange).toBeUndefined();
    expect(playlist.segments[0]?.map?.byteRange).toBeUndefined();
    expect(messages(playlist)).toEqual([
      'EXT-X-BYTERANGE should look like 1000@0 (length@offset); found "100-200".',
      'EXT-X-PROGRAM-DATE-TIME should be an ISO 8601 date and time; found "yesterday".',
      'EXT-X-MAP: BYTERANGE should look like 1000@0; found "all".',
    ]);
  });

  it("reports tags that apply to a segment but have none after them", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        "#EXTINF:4,",
        "a.ts",
        "#EXT-X-BYTERANGE:10@0",
        "#EXT-X-PROGRAM-DATE-TIME:2026-10-18T12:00:00Z",
        "#EXT-X-GAP",
      ),
    );
    expect(playlist.issues).toEqual([
      { line: 4, message: "EXT-X-BYTERANGE isn't followed by a segment." },
      { line: 5, message: "EXT-X-PROGRAM-DATE-TIME isn't followed by a segment." },
      { line: 6, message: "EXT-X-GAP isn't followed by a segment." },
    ]);
  });

  it("reads I-frame playlists and EVENT playlists", () => {
    const playlist = mediaOf(
      m3u8("#EXTM3U", "#EXT-X-PLAYLIST-TYPE:EVENT", "#EXT-X-I-FRAMES-ONLY", "#EXTINF:4,", "a.ts"),
    );
    expect(playlist).toMatchObject({ playlistType: "EVENT", iFramesOnly: true });
  });

  it("reports an unknown playlist type and a fractional target duration", () => {
    const playlist = mediaOf(
      m3u8("#EXTM3U", "#EXT-X-PLAYLIST-TYPE:LIVE", "#EXT-X-TARGETDURATION:6.5"),
    );
    expect(playlist.playlistType).toBeUndefined();
    expect(playlist.targetDuration).toBe(6.5);
    expect(messages(playlist)).toEqual([
      'EXT-X-PLAYLIST-TYPE should be VOD or EVENT; found "LIVE".',
      'EXT-X-TARGETDURATION should be a whole number; found "6.5".',
    ]);
  });
});

describe("containers", () => {
  const map = { line: 1, uri: "init.mp4", attributes: {} };

  it("tells MPEG-TS, fMP4 and other segments apart", () => {
    expect(segmentContainer({ uri: "seg.ts?token=1" })).toBe("ts");
    expect(segmentContainer({ uri: "SEG.TS" })).toBe("ts");
    expect(segmentContainer({ uri: "seg.m4s", map })).toBe("fmp4");
    expect(segmentContainer({ uri: "seg.aac" })).toBe("other");
    expect(segmentContainer({ uri: "seg.vtt" })).toBe("other");
  });

  it("names one container for the playlist", () => {
    expect(playlistContainer([])).toBe("unknown");
    expect(playlistContainer([{ uri: "a.ts" }, { uri: "b.ts" }])).toBe("ts");
    expect(playlistContainer([{ uri: "a.m4s", map }])).toBe("fmp4");
    expect(playlistContainer([{ uri: "a.ts" }, { uri: "b.m4s", map }])).toBe("mixed");
    expect(playlistContainer([{ uri: "a.vtt" }])).toBe("unknown");
  });
});
