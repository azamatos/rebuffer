import { rfc8216 } from "./findings";
import type { Finding, MediaPlaylist, MultivariantPlaylist } from "./types";

/** A feature a playlist uses and the lowest EXT-X-VERSION that allows it (RFC 8216 §7). */
export interface VersionNeed {
  /** The subject of "… needs version N", e.g. "EXT-X-MAP". */
  feature: string;
  version: number;
  line?: number | undefined;
}

export function mediaVersionNeeds(playlist: MediaPlaylist): VersionNeed[] {
  const { keys, tagLines } = playlist;
  const needs: VersionNeed[] = [];
  const push = (feature: string, version: number, line: number | undefined): void => {
    needs.push({ feature, version, line });
  };

  const ivKey = keys.find((key) => key.iv !== undefined);
  if (ivKey !== undefined) push("The IV attribute of EXT-X-KEY", 2, ivKey.line);
  if (playlist.firstDecimalDurationLine !== undefined) {
    push("A decimal EXTINF duration", 3, playlist.firstDecimalDurationLine);
  }
  const byteRangeLine = tagLines["EXT-X-BYTERANGE"];
  if (byteRangeLine !== undefined) push("EXT-X-BYTERANGE", 4, byteRangeLine);
  const iFramesOnlyLine = tagLines["EXT-X-I-FRAMES-ONLY"];
  if (iFramesOnlyLine !== undefined) push("EXT-X-I-FRAMES-ONLY", 4, iFramesOnlyLine);
  const sampleAesKey = keys.find((key) => key.method === "SAMPLE-AES");
  if (sampleAesKey !== undefined) push("METHOD=SAMPLE-AES in EXT-X-KEY", 5, sampleAesKey.line);
  const keyFormatKey = keys.find(
    (key) => key.keyFormat !== undefined || key.keyFormatVersions !== undefined,
  );
  if (keyFormatKey !== undefined) {
    const attribute = keyFormatKey.keyFormat !== undefined ? "KEYFORMAT" : "KEYFORMATVERSIONS";
    push(`The ${attribute} attribute of EXT-X-KEY`, 5, keyFormatKey.line);
  }
  const mapLine = tagLines["EXT-X-MAP"];
  if (mapLine !== undefined) {
    push(
      playlist.iFramesOnly ? "EXT-X-MAP" : "EXT-X-MAP outside an I-frame playlist",
      playlist.iFramesOnly ? 5 : 6,
      mapLine,
    );
  }
  return needs;
}

export function multivariantVersionNeeds(playlist: MultivariantPlaylist): VersionNeed[] {
  const service = playlist.renditions.find((rendition) =>
    rendition.instreamId?.startsWith("SERVICE"),
  );
  return service === undefined
    ? []
    : [
        {
          feature: `INSTREAM-ID="${service.instreamId ?? ""}"`,
          version: 7,
          line: service.line,
        },
      ];
}

/**
 * One error per feature that needs a higher version than the playlist declares. `hasVersionTag`
 * tells a missing EXT-X-VERSION from one that couldn't be read.
 */
export function versionFindings(
  declared: number | undefined,
  hasVersionTag: boolean,
  needs: VersionNeed[],
): Finding[] {
  const effective = declared ?? 1;
  const declaration =
    declared !== undefined
      ? `the playlist declares version ${declared}`
      : hasVersionTag
        ? "the playlist's EXT-X-VERSION isn't a whole number, so it counts as version 1"
        : "the playlist has no EXT-X-VERSION, so it counts as version 1";
  return needs
    .filter((need) => need.version > effective)
    .map((need) => ({
      id: "version-too-low",
      severity: "error",
      message: `${need.feature} needs version ${need.version}; ${declaration}.`,
      detail:
        "A player reads EXT-X-VERSION to know which rules the playlist follows. An older or strict player may reject the playlist or misread tags that the declared version doesn't allow.",
      line: need.line,
      ref: rfc8216("7"),
    }));
}
