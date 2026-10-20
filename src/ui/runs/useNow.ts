import { useState } from "react";

/** The time when the component first rendered, epoch milliseconds: enough for "Today" and "Yesterday". */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
