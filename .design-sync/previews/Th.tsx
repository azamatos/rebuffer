import { Td, Th } from "rebuffer";

const downloads = [
  { n: 1, quality: "720p", size: "2.1 MB", took: "0:00.7", status: "Done" },
  { n: 2, quality: "720p", size: "2.0 MB", took: "0:01.9", status: "Done" },
  { n: 3, quality: "360p", size: "0.6 MB", took: "0:04.2", status: "Abandoned" },
];

// Header cells: sticky, muted, a rule under them; the first one lines up with the table's edge.
export function DownloadsHeader() {
  return (
    <div className="rounded-xl bg-ground p-5 text-fg">
      <div className="rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <Th>Segment</Th>
              <Th>Quality</Th>
              <Th>Size</Th>
              <Th>Took</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {downloads.map((row) => (
              <tr key={row.n} className="border-t border-fg/6">
                <Td>{row.n}</Td>
                <Td>{row.quality}</Td>
                <Td>{row.size}</Td>
                <Td mono>{row.took}</Td>
                <Td>{row.status}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
