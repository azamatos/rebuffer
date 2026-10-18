import { describe, expect, it } from "vitest";
import malformed from "./fixtures/malformed.m3u8?raw";
import { parsePlaylist } from "./parse";
import { lineOf, m3u8, mediaOf, messages, multivariantOf } from "./testing";

describe("parsePlaylist: the header", () => {
  it("rejects text that doesn't start with #EXTM3U", () => {
    expect(parsePlaylist("<html>Not found</html>")).toEqual({
      kind: "invalid",
      issues: [
        { line: 1, message: "The text doesn't start with #EXTM3U, so it isn't an HLS playlist." },
      ],
    });
    expect(parsePlaylist(m3u8("#EXT-X-VERSION:3", "#EXTM3U")).kind).toBe("invalid");
    expect(parsePlaylist(m3u8("#EXTINF:6,", "a.ts")).kind).toBe("invalid");
  });

  it("rejects empty input", () => {
    expect(parsePlaylist("")).toEqual({
      kind: "invalid",
      issues: [{ line: 1, message: "The playlist is empty." }],
    });
    expect(parsePlaylist(" \n\n\t\n").kind).toBe("invalid");
  });

  it("accepts a byte order mark, CRLF line ends and trailing whitespace", () => {
    const text = "﻿#EXTM3U \r\n#EXT-X-TARGETDURATION:6\t\r\n#EXTINF:6.0,  \r\nsegment0.ts  \r\n";
    const playlist = mediaOf(text);
    expect(playlist.issues).toEqual([]);
    expect(playlist.targetDuration).toBe(6);
    expect(playlist.segments).toMatchObject([{ uri: "segment0.ts", duration: 6, line: 3 }]);
  });

  it("accepts old Mac CR line ends", () => {
    expect(mediaOf("#EXTM3U\r#EXTINF:4,\rsegment.ts").segments).toHaveLength(1);
  });

  it("reads #EXTM3U after leading blank lines and comments, and says it should be first", () => {
    const playlist = mediaOf(m3u8("", "# made by hand", "#EXTM3U", "#EXTINF:4,", "a.ts"));
    expect(playlist.segments[0]?.line).toBe(4);
    expect(playlist.issues).toEqual([
      { line: 3, message: "#EXTM3U should be on line 1; here it's on line 3." },
    ]);
  });

  it("reports text after #EXTM3U and a second #EXTM3U", () => {
    const playlist = mediaOf(m3u8("#EXTM3U:x", "#EXTM3U", "#EXTINF:4,", "a.ts"));
    expect(messages(playlist)).toEqual([
      "#EXTM3U should be alone on its line.",
      "#EXTM3U appears again; only the first line should have it.",
    ]);
  });

  it("ignores comments and lower-case tags, which are comments too", () => {
    const playlist = mediaOf(m3u8("#EXTM3U", "#ext-x-endlist", "## note", "#EXTINF:4,", "a.ts"));
    expect(playlist.endList).toBe(false);
    expect(playlist.unknownTags).toEqual([]);
    expect(playlist.issues).toEqual([]);
  });
});

describe("parsePlaylist: kind", () => {
  it("reads a playlist with EXTINF or EXT-X-TARGETDURATION as a media playlist", () => {
    expect(parsePlaylist(m3u8("#EXTM3U", "#EXT-X-TARGETDURATION:6")).kind).toBe("media");
    expect(parsePlaylist(m3u8("#EXTM3U", "#EXTINF:6,", "a.ts")).kind).toBe("media");
  });

  it("reads a playlist with multivariant tags as a multivariant playlist", () => {
    const text = m3u8("#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=1", "a.m3u8");
    expect(parsePlaylist(text).kind).toBe("multivariant");
  });

  it("reads #EXTM3U alone as an empty media playlist", () => {
    expect(mediaOf("#EXTM3U").segments).toEqual([]);
  });

  it("reports a playlist that mixes both kinds and ignores the tags of the other kind", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        "#EXT-X-STREAM-INF:BANDWIDTH=1",
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="a"',
        "#EXT-X-STREAM-INF:BANDWIDTH=2",
        "#EXTINF:6,",
        "a.ts",
      ),
    );
    expect(playlist.issues).toEqual([
      {
        line: 0,
        message: "The playlist mixes multivariant and media tags; it's read as a media playlist.",
      },
      {
        line: 2,
        message:
          "EXT-X-STREAM-INF belongs in multivariant playlists; it's ignored in this media playlist.",
      },
      {
        line: 3,
        message:
          "EXT-X-MEDIA belongs in multivariant playlists; it's ignored in this media playlist.",
      },
    ]);
    expect(playlist.segments).toHaveLength(1);
  });

  it("reads a multivariant playlist with a stray media tag as multivariant", () => {
    const playlist = multivariantOf(
      m3u8("#EXTM3U", "#EXT-X-ENDLIST", "#EXT-X-STREAM-INF:BANDWIDTH=1", "a.m3u8"),
    );
    expect(playlist.variants).toHaveLength(1);
    expect(messages(playlist)).toContain(
      "EXT-X-ENDLIST belongs in media playlists; it's ignored in this multivariant playlist.",
    );
  });
});

describe("parsePlaylist: tags", () => {
  it("keeps unknown tags with their line and value", () => {
    const playlist = mediaOf(
      m3u8("#EXTM3U", "#EXT-X-ALLOW-CACHE:NO", "#EXT-X-CUE-IN", "#EXTINF:4,", "a.ts"),
    );
    expect(playlist.unknownTags).toEqual([
      { line: 2, tag: "EXT-X-ALLOW-CACHE", value: "NO" },
      { line: 3, tag: "EXT-X-CUE-IN", value: "" },
    ]);
  });

  it("records the first line of every tag", () => {
    const playlist = mediaOf(m3u8("#EXTM3U", "#EXTINF:4,", "a.ts", "#EXTINF:4,", "b.ts"));
    expect(playlist.tagLines).toEqual({ EXTINF: 2 });
  });

  it("reads EXT-X-VERSION, EXT-X-INDEPENDENT-SEGMENTS and EXT-X-START in both kinds", () => {
    const tags = [
      "#EXT-X-VERSION:7",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      "#EXT-X-START:TIME-OFFSET=-12.5,PRECISE=YES",
    ];
    const media = mediaOf(m3u8("#EXTM3U", ...tags, "#EXTINF:4,", "a.ts"));
    const multivariant = multivariantOf(
      m3u8("#EXTM3U", ...tags, "#EXT-X-STREAM-INF:BANDWIDTH=1", "a.m3u8"),
    );
    for (const playlist of [media, multivariant]) {
      expect(playlist.version).toBe(7);
      expect(playlist.independentSegments).toBe(true);
      expect(playlist.start).toEqual({ line: 4, timeOffset: -12.5, precise: true });
      expect(playlist.issues).toEqual([]);
    }
  });

  it("keeps the first of tags that may appear once and reports the others", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:6",
        "#EXT-X-VERSION:7",
        "#EXT-X-TARGETDURATION:10",
      ),
    );
    expect(playlist.version).toBe(3);
    expect(playlist.targetDuration).toBe(6);
    expect(messages(playlist)).toEqual([
      "EXT-X-VERSION appears again (first on line 2); this one is ignored.",
      "EXT-X-TARGETDURATION appears again (first on line 3); this one is ignored.",
    ]);
  });

  it("reports an EXT-X-START without TIME-OFFSET", () => {
    const playlist = mediaOf(m3u8("#EXTM3U", "#EXT-X-START:PRECISE=YES"));
    expect(playlist.start).toBeUndefined();
    expect(messages(playlist)).toEqual(["EXT-X-START: TIME-OFFSET is missing; it's required."]);
  });

  it("sorts issues by line", () => {
    const playlist = mediaOf(malformed);
    const lines = playlist.issues.map((issue) => issue.line);
    expect(lines).toEqual(lines.toSorted((a, b) => a - b));
  });
});

describe("parsePlaylist: URI resolution", () => {
  const base = "https://cdn.example.com/films/tears/1080/index.m3u8?token=abc";

  it("resolves relative, root-relative and absolute URIs against the base URL", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        '#EXT-X-KEY:METHOD=AES-128,URI="/keys/k1"',
        '#EXT-X-MAP:URI="../init.mp4"',
        "#EXTINF:4,",
        "seg0.m4s",
        "#EXTINF:4,",
        "https://other.example.org/seg1.m4s",
      ),
      { baseUrl: base },
    );
    const [first, second] = playlist.segments;
    expect(first?.resolvedUri).toBe("https://cdn.example.com/films/tears/1080/seg0.m4s");
    expect(first?.map?.resolvedUri).toBe("https://cdn.example.com/films/tears/init.mp4");
    expect(first?.key?.resolvedUri).toBe("https://cdn.example.com/keys/k1");
    expect(second?.resolvedUri).toBe("https://other.example.org/seg1.m4s");
  });

  it("resolves multivariant URIs", () => {
    const playlist = multivariantOf(
      m3u8(
        "#EXTM3U",
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="English",URI="audio/en.m3u8"',
        '#EXT-X-STREAM-INF:BANDWIDTH=1,AUDIO="a"',
        "video/720.m3u8",
        '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1,URI="video/720-iframes.m3u8"',
      ),
      { baseUrl: base },
    );
    expect(playlist.renditions[0]?.resolvedUri).toBe(
      "https://cdn.example.com/films/tears/1080/audio/en.m3u8",
    );
    expect(playlist.variants[0]?.resolvedUri).toBe(
      "https://cdn.example.com/films/tears/1080/video/720.m3u8",
    );
    expect(playlist.iFrameVariants[0]?.resolvedUri).toBe(
      "https://cdn.example.com/films/tears/1080/video/720-iframes.m3u8",
    );
  });

  it("leaves URIs unresolved without a base URL", () => {
    const segment = mediaOf(m3u8("#EXTM3U", "#EXTINF:4,", "a.ts")).segments[0];
    expect(segment?.uri).toBe("a.ts");
    expect(segment?.resolvedUri).toBeUndefined();
  });

  it("reports a base URL that isn't absolute and leaves URIs relative", () => {
    const playlist = mediaOf(m3u8("#EXTM3U", "#EXTINF:4,", "a.ts"), { baseUrl: "films/x.m3u8" });
    expect(playlist.segments[0]?.resolvedUri).toBeUndefined();
    expect(playlist.issues).toEqual([
      {
        line: 0,
        message: 'The base URL "films/x.m3u8" isn\'t a valid absolute URL, so URIs stay relative.',
      },
    ]);
  });

  it("reports a URI that can't be resolved", () => {
    const playlist = mediaOf(m3u8("#EXTM3U", "#EXTINF:4,", "http://[broken/a.ts"), {
      baseUrl: base,
    });
    expect(playlist.segments[0]?.resolvedUri).toBeUndefined();
    expect(playlist.issues).toEqual([
      { line: 3, message: '"http://[broken/a.ts" can\'t be resolved against the base URL.' },
    ]);
  });
});

describe("parsePlaylist: variables (EXT-X-DEFINE)", () => {
  it("substitutes variables in URI lines and quoted attribute values", () => {
    const playlist = multivariantOf(
      m3u8(
        "#EXTM3U",
        "#EXT-X-VERSION:8",
        '#EXT-X-DEFINE:NAME="cdn",VALUE="https://cdn.example.com"',
        '#EXT-X-DEFINE:NAME="auth",VALUE="token=abc"',
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",URI="{$cdn}/audio.m3u8?{$auth}"',
        '#EXT-X-STREAM-INF:BANDWIDTH=1,AUDIO="aac"',
        "{$cdn}/video.m3u8?{$auth}",
      ),
    );
    expect(playlist.renditions[0]?.uri).toBe("https://cdn.example.com/audio.m3u8?token=abc");
    expect(playlist.variants[0]?.uri).toBe("https://cdn.example.com/video.m3u8?token=abc");
    expect(playlist.defines).toEqual([
      { line: 3, name: "cdn", source: "value", value: "https://cdn.example.com" },
      { line: 4, name: "auth", source: "value", value: "token=abc" },
    ]);
    expect(playlist.issues).toEqual([]);
  });

  it("substitutes variables in media playlists and resolves the result", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        '#EXT-X-DEFINE:NAME="dir",VALUE="v720"',
        '#EXT-X-MAP:URI="{$dir}/init.mp4"',
        "#EXTINF:4,",
        "{$dir}/seg0.m4s",
      ),
      { baseUrl: "https://cdn.example.com/x/index.m3u8" },
    );
    expect(playlist.segments[0]?.uri).toBe("v720/seg0.m4s");
    expect(playlist.segments[0]?.resolvedUri).toBe("https://cdn.example.com/x/v720/seg0.m4s");
    expect(playlist.segments[0]?.map?.uri).toBe("v720/init.mp4");
  });

  it("reports references to variables that aren't defined yet", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        "#EXTINF:4,",
        "{$dir}/seg0.ts",
        '#EXT-X-DEFINE:NAME="dir",VALUE="v1"',
        "#EXTINF:4,",
        "{$dir}/seg1.ts",
      ),
    );
    expect(playlist.segments.map((segment) => segment.uri)).toEqual([
      "{$dir}/seg0.ts",
      "v1/seg1.ts",
    ]);
    expect(playlist.issues).toEqual([
      { line: 3, message: "The variable {$dir} isn't defined by an earlier EXT-X-DEFINE." },
    ]);
  });

  it("records IMPORT and QUERYPARAM variables without resolving them", () => {
    const playlist = mediaOf(
      m3u8(
        "#EXTM3U",
        '#EXT-X-DEFINE:IMPORT="auth"',
        '#EXT-X-DEFINE:QUERYPARAM="session"',
        "#EXTINF:4,",
        "seg0.ts?{$auth}&s={$session}",
      ),
    );
    expect(playlist.defines).toEqual([
      { line: 2, name: "auth", source: "import", value: undefined },
      { line: 3, name: "session", source: "queryparam", value: undefined },
    ]);
    expect(playlist.segments[0]?.uri).toBe("seg0.ts?{$auth}&s={$session}");
    expect(playlist.issues).toEqual([]);
  });

  it("reports broken definitions", () => {
    const playlist = multivariantOf(
      m3u8(
        "#EXTM3U",
        '#EXT-X-DEFINE:NAME="a"',
        '#EXT-X-DEFINE:NAME="b",VALUE="1",IMPORT="c"',
        '#EXT-X-DEFINE:NAME="has space",VALUE="1"',
        '#EXT-X-DEFINE:NAME="d",VALUE="1"',
        '#EXT-X-DEFINE:NAME="d",VALUE="2"',
        '#EXT-X-DEFINE:IMPORT="e"',
        "#EXT-X-STREAM-INF:BANDWIDTH=1",
        "{$d}.m3u8",
      ),
    );
    expect(playlist.variants[0]?.uri).toBe("1.m3u8");
    expect(playlist.issues).toEqual([
      { line: 2, message: "EXT-X-DEFINE: NAME needs a VALUE." },
      { line: 3, message: "EXT-X-DEFINE: use exactly one of NAME, IMPORT or QUERYPARAM." },
      { line: 4, message: 'EXT-X-DEFINE: "has space" isn\'t a valid variable name.' },
      { line: 6, message: "EXT-X-DEFINE: d is already defined; the first definition is used." },
      { line: 7, message: "EXT-X-DEFINE: IMPORT is only allowed in media playlists." },
    ]);
  });
});

describe("parsePlaylist: robustness", () => {
  const garbage = [
    "#EXTINF",
    "#EXTINF:",
    "#EXTINF:,",
    "#EXT-X-BYTERANGE:",
    "#EXT-X-BYTERANGE:@",
    "#EXT-X-KEY",
    "#EXT-X-KEY:",
    "#EXT-X-KEY:METHOD",
    '#EXT-X-KEY:METHOD="',
    "#EXT-X-MAP:",
    "#EXT-X-MAP:URI",
    "#EXT-X-STREAM-INF",
    '#EXT-X-STREAM-INF:,,,=,="',
    "#EXT-X-MEDIA:TYPE",
    "#EXT-X-I-FRAME-STREAM-INF:",
    "#EXT-X-PART:",
    "#EXT-X-PRELOAD-HINT:",
    "#EXT-X-SKIP:",
    "#EXT-X-DATERANGE:",
    "#EXT-X-PROGRAM-DATE-TIME:",
    "#EXT-X-TARGETDURATION:",
    "#EXT-X-DEFINE:",
    "#EXT-X-SESSION-KEY:METHOD=NONE",
    "#EXT-X-CONTENT-STEERING:",
    "#EXT",
    "#EXT-X-:",
    "{$}",
    "\u0000",
    "a.ts",
  ];

  it("never throws, whatever the lines", () => {
    for (const first of garbage) {
      for (const second of garbage) {
        for (const header of ["#EXTM3U", "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1"]) {
          const text = m3u8(header, first, second, first);
          expect(() => parsePlaylist(text, { baseUrl: "https://example.com/" })).not.toThrow();
        }
      }
    }
  });

  it("reports every problem of a broken playlist with its line", () => {
    const playlist = mediaOf(malformed);
    expect(playlist.issues).toEqual([
      {
        line: 0,
        message: "The playlist mixes multivariant and media tags; it's read as a media playlist.",
      },
      { line: 2, message: 'EXT-X-VERSION should be a whole number; found "three".' },
      {
        line: lineOf(malformed, "#EXT-X-STREAM-INF"),
        message:
          "EXT-X-STREAM-INF belongs in multivariant playlists; it's ignored in this media playlist.",
      },
      { line: lineOf(malformed, "#EXT-X-KEY"), message: "EXT-X-KEY: URI has no closing quote." },
      {
        line: lineOf(malformed, "orphan.ts"),
        message: '"orphan.ts" has no EXTINF before it; it\'s skipped.',
      },
      {
        line: lineOf(malformed, "#EXTINF:abc"),
        message: 'EXTINF: the duration should be a number of seconds; found "abc".',
      },
      {
        line: lineOf(malformed, "#EXT-X-BYTERANGE"),
        message:
          'EXT-X-BYTERANGE has no offset and there\'s no earlier range of "seg3.ts" to continue; offset 0 is assumed.',
      },
      {
        line: lineOf(malformed, "#EXT-X-DISCONTINUITY"),
        message: "EXT-X-DISCONTINUITY isn't followed by a segment.",
      },
      { line: lineOf(malformed, "#EXTINF:5.0"), message: "EXTINF has no URI line after it." },
    ]);
    expect(playlist.segments.map((segment) => segment.uri)).toEqual([
      "seg1.ts",
      "seg2.ts",
      "seg3.ts",
    ]);
    expect(playlist.unknownTags).toEqual([
      { line: lineOf(malformed, "CUSTOM"), tag: "EXT-X-CUSTOM-THING", value: "42" },
    ]);
  });
});
