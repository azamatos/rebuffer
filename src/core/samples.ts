/** Streams a visitor can pick without pasting a link. */
export interface SampleStream {
  id: string;
  name: string;
  url: string;
  description: string;
  /** Hosted by us (media.azamatos.com) or a third party's public test stream. */
  host: "ours" | "third-party";
}

/**
 * Ours first: Blender Studio's Tears of Steel (CC BY 3.0), encoded by scripts/media/encode.mjs and served from
 * media.azamatos.com. The third-party streams allowed browser access (CORS) when checked on 2026-10-18; they have no
 * guarantees and may disappear.
 */
export const SAMPLE_STREAMS: readonly SampleStream[] = [
  {
    id: "tears-of-steel",
    name: "Tears of Steel",
    url: "https://media.azamatos.com/tears-of-steel/clean/master.m3u8",
    description: "Five qualities from 240p to 1080p, fMP4, 4 s segments, English subtitles.",
    host: "ours",
  },
  {
    id: "tears-of-steel-problems",
    name: "Tears of Steel, with problems",
    url: "https://media.azamatos.com/tears-of-steel/problems/master.m3u8",
    description:
      "The same film with planted mistakes for the inspector: a segment over its target duration, an under-declared bandwidth, missing codecs.",
    host: "ours",
  },
  {
    id: "unified-tos",
    name: "Tears of Steel (Unified Streaming)",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    description: "Five qualities up to 1680×750, MPEG-TS, 4 s segments.",
    host: "third-party",
  },
  {
    id: "apple-bipbop",
    name: "Bipbop (Apple)",
    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8",
    description:
      "Apple's classic test stream: five qualities, alternate audio, subtitles, I-frame playlists.",
    host: "third-party",
  },
  {
    id: "mux-bbb",
    name: "Big Buck Bunny (Mux)",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    description: "Five qualities up to 1080p, MPEG-TS, 10 s segments.",
    host: "third-party",
  },
];

export const DEFAULT_STREAM = SAMPLE_STREAMS[0] as SampleStream;
