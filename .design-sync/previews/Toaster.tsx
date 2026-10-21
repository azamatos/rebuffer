import { useEffect } from "react";
import { toast, Toaster } from "rebuffer";

// Mount <Toaster /> once; `toast(text)` shows a confirmation at the bottom right for 3.2 s (a new one replaces it).
// Here it's shown again every 3 s so it stays in view.
function Showing({ text }: { text: string }) {
  useEffect(() => {
    toast(text);
    const timer = setInterval(() => {
      toast(text);
    }, 3000);
    return () => {
      clearInterval(timer);
    };
  }, [text]);
  return (
    <div className="bg-ground" style={{ minHeight: 160 }}>
      <Toaster />
    </div>
  );
}

export function Saved() {
  return <Showing text="Saved in this browser, under “Yours”." />;
}
