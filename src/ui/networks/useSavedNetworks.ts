import { useCallback, useEffect, useState } from "react";
import { savedNetworks, type SavedNetwork } from "@/core/persist/networks";

/**
 * The networks saved in this browser, newest first: undefined while loading, "unavailable" if storage is blocked.
 * `reload` reads them again after a save or a delete.
 */
export function useSavedNetworks(): {
  networks: SavedNetwork[] | "unavailable" | undefined;
  reload: () => void;
} {
  const [networks, setNetworks] = useState<SavedNetwork[] | "unavailable">();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    savedNetworks()
      .list()
      .then(
        (list) => {
          if (current) setNetworks(list);
        },
        () => {
          if (current) setNetworks("unavailable");
        },
      );
    return () => {
      current = false;
    };
  }, [version]);
  const reload = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);
  return { networks, reload };
}
