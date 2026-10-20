import { useSyncExternalStore, type ReactNode } from "react";
import { currentChoice, setChoice, subscribeTheme, type ThemeChoice } from "./theme";

const icon = (path: ReactNode) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    aria-hidden="true"
    className="fill-none stroke-current"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {path}
  </svg>
);

const options: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  {
    value: "system",
    label: "System",
    icon: icon(
      <>
        <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.5" />
        <path d="M5.5 13.75 H10.5 M8 11.25 V13.75" />
      </>,
    ),
  },
  {
    value: "light",
    label: "Light",
    icon: icon(
      <>
        <circle cx="8" cy="8" r="2.75" />
        <path d="M8 1.5 V2.75 M8 13.25 V14.5 M1.5 8 H2.75 M13.25 8 H14.5 M3.4 3.4 L4.3 4.3 M11.7 11.7 L12.6 12.6 M3.4 12.6 L4.3 11.7 M11.7 4.3 L12.6 3.4" />
      </>,
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: icon(<path d="M13.5 9.6 A5.75 5.75 0 1 1 6.4 2.5 A4.5 4.5 0 0 0 13.5 9.6 Z" />),
  },
];

/** System, Light or Dark: three radio buttons, so arrow keys move between them as in any radio group. */
export function ThemeSwitch() {
  const choice = useSyncExternalStore(subscribeTheme, currentChoice, () => "system" as const);
  return (
    <fieldset className="flex rounded-lg border border-line p-0.5">
      <legend className="sr-only">Theme</legend>
      {options.map((option) => (
        <label
          key={option.value}
          title={option.label}
          className="relative flex size-8 cursor-pointer items-center justify-center rounded-md text-fg-3 hover:text-fg has-checked:bg-fg/8 has-checked:text-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-accent"
        >
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={choice === option.value}
            onChange={() => {
              setChoice(option.value);
            }}
            className="sr-only"
          />
          {option.icon}
          <span className="sr-only">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
