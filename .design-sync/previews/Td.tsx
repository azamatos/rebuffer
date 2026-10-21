import { Td, Th } from "rebuffer";

const rows = [
  { at: "0:00", text: "6 Mbps", note: "Start" },
  { at: "0:42", text: "0 Mbps", note: "Into the tunnel" },
  { at: "1:03", text: "6 Mbps", note: "Back out" },
];

// Body cells: `mono` for clock times, so their digits line up down the column.
export function PlainAndMono() {
  return (
    <div className="rounded-xl bg-ground p-5 text-fg">
      <div className="rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Bandwidth</Th>
              <Th>What happens</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.at} className="border-t border-fg/6">
                <Td mono>{row.at}</Td>
                <Td>{row.text}</Td>
                <Td>{row.note}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
