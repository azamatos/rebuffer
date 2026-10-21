import { Wordmark } from "rebuffer";

// The family wordmark shared with azamatos.com, in Space Mono: the prompt arrow, the tilde, the name and a cursor
// that blinks for 4.4 s, then stays.
export function Alone() {
  return (
    <div className="flex rounded-xl bg-ground p-5 text-fg">
      <Wordmark />
    </div>
  );
}

// It has one size, 18 px, wherever it goes; here over Home's eyebrow and title.
export function OverATitle() {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-ground p-5 text-fg">
      <Wordmark />
      <p className="font-mono text-[13px] tracking-[0.08em] text-accent uppercase">HLS network lab</p>
      <p className="text-lg font-semibold">See how a video player survives a bad network.</p>
    </div>
  );
}
