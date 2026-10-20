/**
 * How the inspector reads the web. The page uses `fetchReader`; tests pass a fake. Requests go straight to the
 * network: outside a run, the Service Worker leaves them alone.
 */
export interface Reader {
  /** The text at `url`. Throws a ReadError. */
  text(url: string): Promise<string>;
  /** The size of the file at `url` in bytes, or undefined when the server doesn't say. */
  size(url: string): Promise<number | undefined>;
}

/**
 * Why a read failed. A browser can't tell a server that doesn't allow browsers to read it (CORS) from one it can't
 * reach: both are `unreadable`.
 */
export class ReadError extends Error {
  constructor(
    readonly url: string,
    readonly reason: "unreadable" | "status",
    readonly status?: number,
  ) {
    super(reason === "status" ? `${url} answered ${String(status)}` : `${url} couldn't be read`);
    this.name = "ReadError";
  }
}

/** "media.example.com" from a link, for messages. */
export const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** What went wrong, for people. */
export function describeReadError(error: unknown): string {
  if (!(error instanceof ReadError)) return "The playlist couldn't be read.";
  if (error.reason === "status") {
    return `${hostOf(error.url)} answered ${String(error.status)} for ${error.url}.`;
  }
  return `This browser couldn't read ${hostOf(error.url)}: the server doesn't let browsers read it (CORS), or it couldn't be reached. Paste the playlist's text instead.`;
}

/** A Reader over `fetch`. Sizes come from a HEAD request, or from downloading the file when HEAD says nothing. */
export function fetchReader(fetcher: typeof fetch = fetch): Reader {
  const get = async (url: string, method: "GET" | "HEAD") => {
    let response: Response;
    try {
      response = await fetcher(url, { method, cache: "no-store" });
    } catch {
      throw new ReadError(url, "unreadable");
    }
    if (!response.ok) throw new ReadError(url, "status", response.status);
    return response;
  };
  return {
    async text(url) {
      return (await get(url, "GET")).text();
    },
    async size(url) {
      try {
        const length = Number((await get(url, "HEAD")).headers.get("content-length"));
        if (length > 0) return length;
      } catch {
        // Some servers refuse HEAD; a download says how big the file is.
      }
      try {
        return (await (await get(url, "GET")).arrayBuffer()).byteLength;
      } catch {
        return undefined;
      }
    },
  };
}
