import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { NetworkCurve } from "@/core/netsim/curve-math";
import { networkById } from "@/core/netsim/networks";
import { recordedTraces } from "@/core/netsim/traces";
import { savedNetworks, type SavedNetwork } from "@/core/persist/networks";
import { savedRuns } from "@/core/persist/runs";
import { DEFAULT_NETWORK_ID } from "@/core/run/setup";
import { NetworkEditor, type EditorStart } from "@/ui/networks/NetworkEditor";
import { NetworkList, type NetworksSearch } from "@/ui/networks/NetworkList";
import { useSavedNetworks } from "@/ui/networks/useSavedNetworks";

type Loaded =
  | { status: "loading" }
  | { status: "missing"; message: string }
  | { status: "ready"; start: EditorStart };

/** A new network: 5 Mbps for a minute, ready to be drawn on. */
const BLANK: NetworkCurve = { shape: "steps", rttMs: 50, lengthS: 60, points: [{ t: 0, mbps: 5 }] };

const isTrace = (id: string | undefined) => recordedTraces.some((trace) => trace.id === id);

/** What the address names, ready for the editor. */
async function resolve(search: NetworksSearch): Promise<Loaded> {
  const plain = { description: undefined, trace: false, saved: undefined, run: undefined };
  if (search.saved !== undefined) {
    const saved = await savedNetworks().get(search.saved);
    return saved
      ? {
          status: "ready",
          start: { ...plain, name: saved.name, curve: saved.curve, runsAs: undefined, saved },
        }
      : {
          status: "missing",
          message:
            "This browser has no saved network at this address. Networks are kept only in the browser that saved them.",
        };
  }
  if (search.run !== undefined) {
    const run = await savedRuns().get(search.run);
    if (!run) return { status: "missing", message: "This browser has no run at this address." };
    const { network } = run.setup;
    return {
      status: "ready",
      start: {
        ...plain,
        name: network.name,
        curve: network.curve,
        runsAs: network.id,
        trace: isTrace(network.id),
        run,
      },
    };
  }
  if (search.new === "blank") {
    return {
      status: "ready",
      start: { ...plain, name: "My network", curve: BLANK, runsAs: undefined, fresh: true },
    };
  }
  const id = search.network ?? DEFAULT_NETWORK_ID;
  const network = networkById(id);
  if (!network) return { status: "missing", message: `There's no network called “${id}”.` };
  return {
    status: "ready",
    start: {
      ...plain,
      name: network.name,
      description: network.description,
      curve: network.curve,
      runsAs: network.id,
      trace: isTrace(network.id),
    },
  };
}

/** The Networks screen: presets, recorded traces and your own networks, and an editor for the chosen one. */
const networksRoute = getRouteApi("/networks");

/** The Networks screen as the router shows it: the network comes from the URL. */
export function NetworksRoute() {
  return <NetworksPage search={networksRoute.useSearch()} />;
}

export function NetworksPage({ search }: { search: NetworksSearch }) {
  const navigate = useNavigate();
  const { networks: saved, reload } = useSavedNetworks();
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [editorKey, setEditorKey] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // A save moves the address to the saved network; the editor already shows it, so that move loads nothing.
  const ownMove = useRef<string | undefined>(undefined);
  const { network, saved: savedId, run, new: blank } = search;

  useEffect(() => {
    if (savedId !== undefined && savedId === ownMove.current) return;
    ownMove.current = undefined;
    let current = true;
    void resolve({
      ...(network === undefined ? {} : { network }),
      ...(savedId === undefined ? {} : { saved: savedId }),
      ...(run === undefined ? {} : { run }),
      ...(blank === undefined ? {} : { new: blank }),
    }).then(
      (result) => {
        if (!current) return;
        setLoaded(result);
        setEditorKey((key) => key + 1);
      },
      () => {
        if (current)
          setLoaded({
            status: "missing",
            message: "This browser didn't let the lab read its saved data.",
          });
      },
    );
    return () => {
      current = false;
    };
  }, [network, savedId, run, blank]);

  const onSaved = (network: SavedNetwork) => {
    reload();
    if (savedId === network.id) return;
    ownMove.current = network.id;
    void navigate({ to: "/networks", search: { saved: network.id }, replace: true });
  };

  const onDeleted = () => {
    reload();
    void navigate({ to: "/networks", search: {} }).then(() => {
      headingRef.current?.focus();
    });
  };

  // With nothing in the address, the editor shows the default network, and the list marks it.
  const current: NetworksSearch =
    network === undefined && savedId === undefined && run === undefined && blank === undefined
      ? { network: DEFAULT_NETWORK_ID }
      : search;

  return (
    <div className="mx-auto flex max-w-[1360px] flex-wrap items-start gap-5 px-4 pt-5 pb-10 sm:px-8">
      {/* On wide screens the list stays in view and scrolls on its own beside the editor. */}
      <div className="flex max-w-full min-w-0 flex-[1_1_260px] flex-col gap-2 rounded-xl border border-line bg-surface p-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:max-w-[300px] lg:overflow-auto">
        <div className="mx-2 mt-0.5 mb-1">
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            Networks
          </h1>
          <p className="mt-0.5 text-[13px] text-fg-3">
            Pick one, change it, keep it in this browser, run with it.
          </p>
        </div>
        <NetworkList current={current} saved={saved} />
      </div>
      {loaded.status === "ready" ? (
        <NetworkEditor
          key={editorKey}
          start={loaded.start}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      ) : (
        <p className="min-w-0 flex-[999_1_640px] text-fg-2">
          {loaded.status === "loading" ? "Loading the network…" : loaded.message}
        </p>
      )}
    </div>
  );
}
