/**
 * Formats seconds as a clock: `58` → "0:58", `3725` → "1:02:05".
 * With `decimals`, adds tenths or hundredths: `51.8` → "0:51.8".
 * Negative and non-finite values are formatted as "0:00" (a run never shows negative time).
 */
export function formatClock(seconds: number, decimals: 0 | 1 | 2 = 0): string {
  const factor = 10 ** decimals;
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * factor) / factor : 0;

  const whole = Math.floor(total);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const fraction =
    decimals > 0 ? `.${String(Math.round((total - whole) * factor)).padStart(decimals, "0")}` : "";

  const ss = String(secs).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}${fraction}`
    : `${minutes}:${ss}${fraction}`;
}

/** Formats a duration in seconds for prose: `3.4` → "3.4 s", `0.25` → "250 ms", `125` → "2 min 5 s". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 s";
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${Number(seconds.toFixed(seconds < 10 ? 1 : 0))} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const two = (value: number) => String(value).padStart(2, "0");

/** When a run happened, in the visitor's time zone: "Today, 14:32", "Yesterday, 09:05", "18 Oct 2026, 14:32". */
export function formatWhen(epochMs: number, nowMs: number): string {
  const date = new Date(epochMs);
  const time = `${two(date.getHours())}:${two(date.getMinutes())}`;
  const day = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const today = day(new Date(nowMs));
  const then = day(date);
  if (then === today) return `Today, ${time}`;
  if (then === day(new Date(today - 12 * 3600 * 1000))) return `Yesterday, ${time}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""} ${date.getFullYear()}, ${time}`;
}
