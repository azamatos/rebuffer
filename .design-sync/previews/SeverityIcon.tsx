import { SeverityIcon } from "rebuffer";

// Severity is a shape as well as a colour, and always comes with a word: the Inspect screen's findings.
export function Findings() {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-ground p-5 text-sm text-fg">
      <p className="flex items-center gap-2">
        <SeverityIcon severity="error" />
        <span>
          <span className="font-semibold text-error-text">Error ·</span> Segment 2 lasts 6.6 s; the
          target duration is 6 s.
        </span>
      </p>
      <p className="flex items-center gap-2">
        <SeverityIcon severity="warning" />
        <span>
          <span className="font-semibold text-warning-text">Warning ·</span> 720p declares 2.8 Mbps;
          its segments peak at 3.4 Mbps.
        </span>
      </p>
      <p className="flex items-center gap-2">
        <SeverityIcon severity="note" />
        <span>
          <span className="font-semibold text-note-text">Note ·</span> The playlist has no I-frame
          playlists.
        </span>
      </p>
    </div>
  );
}

// 8 px marks a playlist chip, 12 px (the default) a count or a table cell, 18 px a finding's headline.
export function Sizes() {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-ground p-5">
      <SeverityIcon severity="error" size={8} />
      <SeverityIcon severity="error" />
      <SeverityIcon severity="error" size={18} />
      <SeverityIcon severity="warning" size={8} />
      <SeverityIcon severity="warning" />
      <SeverityIcon severity="warning" size={18} />
      <SeverityIcon severity="note" size={8} />
      <SeverityIcon severity="note" />
      <SeverityIcon severity="note" size={18} />
    </div>
  );
}
