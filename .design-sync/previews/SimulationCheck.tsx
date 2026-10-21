import { SimulationCheck } from "rebuffer";

// Train through a tunnel: 6 Mbps, weaker in the tunnel, 12 s with nothing, and back.
const tunnel = {
  shape: "slopes" as const,
  rttMs: 80,
  lengthS: 90,
  points: [
    { t: 0, mbps: 6 },
    { t: 20, mbps: 3 },
    { t: 30, mbps: 2.5 },
    { t: 42, mbps: 0 },
    { t: 54, mbps: 0 },
    { t: 63, mbps: 6 },
  ],
};

const onTime = { late: 0, typicalLateMs: 0, worstLateMs: 0 };

// Every download arrived when the simulated network said it would: the quiet line.
export function KeptUp() {
  return (
    <div className="rounded-xl bg-ground p-5 text-fg">
      <SimulationCheck
        curve={tunnel}
        honesty={{
          requests: 54,
          saved: 0,
          latency: { host: "media.azamatos.com", realMs: 41, ...onTime },
          bandwidth: { ...onTime, realBps: 38_000_000 },
          hiddenS: 0,
        }}
      />
    </div>
  );
}

// A run of Apple's example stream from far away: the real network held it back, and the tab was hidden for a while.
// The banner opens to the details.
export function HeldBack() {
  return (
    <div className="rounded-xl bg-ground p-5 text-fg">
      <SimulationCheck
        curve={tunnel}
        honesty={{
          requests: 54,
          saved: 0,
          latency: {
            host: "devstreaming-cdn.apple.com",
            realMs: 576,
            late: 54,
            typicalLateMs: 662,
            worstLateMs: 751,
          },
          bandwidth: { late: 34, typicalLateMs: 457, worstLateMs: 3300, realBps: 1_400_000 },
          hiddenS: 47,
        }}
      />
    </div>
  );
}

// A repeat run, answered from the copy the first run saved: the real network played no part.
export function FromTheSavedCopy() {
  return (
    <div className="rounded-xl bg-ground p-5 text-fg">
      <SimulationCheck
        curve={tunnel}
        honesty={{
          requests: 54,
          saved: 54,
          latency: { host: "media.azamatos.com", realMs: 41, ...onTime },
          bandwidth: { ...onTime, realBps: undefined },
          hiddenS: 0,
        }}
      />
    </div>
  );
}
