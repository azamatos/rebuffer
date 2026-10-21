# Rebuffer: building with these components

Rebuffer is a dark "instrument panel" web app (an HLS network lab). Designs should look like its screens: a near-black
ground, dark cards with hairline borders, Geist for text, Space Mono for clocks and eyebrows, one mint accent.

## Setup

- No provider or wrapper. `styles.css` brings the colour tokens of both themes, the app's compiled stylesheet
  (`_ds_bundle.css`) and the fonts (`fonts/fonts.css`: Geist Variable, Space Mono).
- The page's `<body>` gets the ground, the text colour and Geist from that stylesheet. Don't put designs on a white
  page or card: every colour assumes the ground.
- Dark is the default. For the light theme set `data-theme="light"` on `<html>` (that's what `ThemeSwitch` does); it
  can't be scoped to a part of the page.

## Styling: the app's Tailwind classes, and its CSS variables

The stylesheet holds only the classes the app itself uses, so an arbitrary Tailwind class may do nothing. Use the
token classes and recipes below; for anything else write inline styles with the variables, e.g.
`style={{ background: "var(--color-surface)" }}`.

| Role | Variables | Classes |
|---|---|---|
| Page, cards, borders | `--color-ground`, `--color-surface`, `--color-line`, `--color-line-strong` | `bg-ground`, `bg-surface`, `border-line`, `border-line-strong` |
| Text | `--color-fg`, `--color-fg-2` (secondary), `--color-fg-3` (muted) | `text-fg`, `text-fg-2`, `text-fg-3` |
| Accent | `--color-accent`, `--color-accent-hover`, `--color-accent-ink` (text on it) | `bg-accent`, `text-accent`, `text-accent-ink` |
| Status, always with a shape and a word | `--color-error`, `--color-warning`, `--color-note`, and `-text` versions for words | `text-error-text`, `text-warning-text`, `text-note-text` |
| Fonts | `--font-sans` (Geist), `--font-mono` (Space Mono) | `font-mono` |

Chart series mean one thing everywhere: `--color-net` (blue) the network, `--color-estimate` (pink) the player's
estimate, `--color-onscreen` (green) the quality on screen, `--color-buffer` (purple) the buffer, `--color-error`
(red) a stall, `--color-q0` to `--color-q4` the qualities from lowest to highest.

Recipes:

- Card: `rounded-xl border border-line bg-surface px-4 py-3`
- Primary button: `inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-accent px-4 font-semibold text-accent-ink hover:bg-accent-hover`
- Secondary button: `inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line-strong px-3.5 text-fg hover:border-fg-3`
- Eyebrow: `font-mono text-[13px] tracking-[0.08em] text-accent uppercase`
- Chart header: title `text-sm font-semibold`, unit after it in `font-normal text-fg-3`, legend `text-xs text-fg-2`
- Big number: `text-5xl font-semibold tabular-nums`, its unit `text-lg font-medium text-fg-3`

## Where the truth lives

`styles.css` and what it imports (`_ds_bundle.css` is the full stylesheet: grep it before using a class), and each
component's `.prompt.md` and `.d.ts`.

## The parts

- `Popover` + `MenuItem`: menus; `children` is a function of `close`; `danger` for a destructive item, last.
- `ShowAs` + `ChartOrTable`: every chart's Chart | Table; the table goes in `renderTable`, built from `Th` and `Td`
  (`mono` for clock times). `Key` for legend entries (an SVG swatch and a label).
- `SimulationCheck`: whether the real network let the simulation work; show it with every result or report.
- `SeverityIcon`: error, warning and note as shapes, always beside the word.
- `Hint`: a one-line first-run note with "Got it". `Toaster` once per page, then `toast("Saved.")` to confirm.
- `ZoomBar`: zoom over a run's time range. `ThemeSwitch` and `Wordmark` belong in the header.

## Example

```tsx
const { MenuItem, Popover } = window.Rebuffer;
const secondary =
  "inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line-strong px-3.5 text-fg hover:border-fg-3";

<div className="flex flex-wrap items-center gap-2">
  <button className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-accent px-4 font-semibold text-accent-ink hover:bg-accent-hover">
    Run again
  </button>
  <button className={secondary}>Compare with…</button>
  <Popover label="More actions" align="end" buttonClassName={`${secondary} px-3 aria-expanded:border-fg-3`} button={<span aria-hidden="true">⋯</span>}>
    {(close) => (
      <>
        <MenuItem onSelect={close}>Export JSON</MenuItem>
        <MenuItem danger onSelect={close}>Delete</MenuItem>
      </>
    )}
  </Popover>
</div>
```
