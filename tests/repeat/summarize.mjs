// Turns repeat-results/*.json (tests/repeat/repeat.spec.ts) into repeat-results/summary.md: per network, the spread of
// each number across its runs. On GitHub Actions the table also goes to the job's summary.
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../../repeat-results/", import.meta.url);
let files;
try {
  files = readdirSync(dir).filter((file) => file.endsWith(".json"));
} catch {
  files = [];
}
if (files.length === 0) {
  console.error("No results in repeat-results/: run `pnpm repeat` first.");
  process.exit(1);
}

const results = files.map((file) => JSON.parse(readFileSync(new URL(file, dir), "utf8")));
const range = (values, format) => {
  const known = values.filter((value) => value !== undefined && value !== null);
  if (known.length === 0) return "—";
  const low = Math.min(...known);
  const high = Math.max(...known);
  return format(low) === format(high) ? format(low) : `${format(low)}–${format(high)}`;
};
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const rows = results.map(({ network, runs }) => {
  const scores = runs.map((run) => run.score);
  const spread = Math.round(Math.max(...scores)) - Math.round(Math.min(...scores));
  return {
    spread,
    cells: [
      network.name,
      String(runs.length),
      range(scores, (value) => String(Math.round(value))),
      String(spread),
      range(
        runs.map((run) => run.firstFrameS),
        (value) => `${value.toFixed(2)} s`,
      ),
      range(
        runs.map((run) => run.stalls),
        String,
      ),
      range(
        runs.map((run) => run.stallS),
        (value) => `${value.toFixed(1)} s`,
      ),
      range(
        runs.map((run) => run.averageBitrate),
        (value) => `${(value / 1e6).toFixed(2)} Mbps`,
      ),
      range(
        runs.map((run) => run.switches),
        String,
      ),
      String(runs.reduce((total, run) => total + run.late, 0)),
    ],
  };
});

const { browser, player, stream, measuredAt } = results[0];
const spreads = rows.map((row) => row.spread);
const header = [
  "Network",
  "Runs",
  "Score",
  "Spread",
  "First frame",
  "Stalls",
  "Stall time",
  "Average bitrate",
  "Switches",
  "Late downloads",
];
const table = [
  `| ${header.join(" | ")} |`,
  `|${header.map(() => "---").join("|")}|`,
  ...rows.map((row) => `| ${row.cells.join(" | ")} |`),
].join("\n");
const markdown = `## Repeatability

${browser}, ${player}; stream: ${stream}; measured ${measuredAt.slice(0, 10)}.
Scores across runs of one network differ by at most ${Math.max(...spreads)} points (median spread ${median(spreads)}).

${table}
`;

writeFileSync(new URL("summary.md", dir), markdown);
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
