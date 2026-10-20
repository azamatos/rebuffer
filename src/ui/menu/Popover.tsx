import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from "react";

interface PopoverProps {
  /** The button's content: its accessible name, unless `label` names an icon-only button. */
  button: ReactNode;
  label?: string;
  buttonClassName: string;
  /** Which edge of the button the panel lines up with. */
  align?: "start" | "end";
  panelClassName?: string;
  /** Open and close it from outside too (the Networks screen's `?` key); uncontrolled without these. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The panel's content; `close` puts focus back on the button. */
  children: (close: () => void) => ReactNode;
}

/**
 * A button that shows a panel below it (a disclosure: `aria-expanded`, not an ARIA menu, so Tab moves through what's
 * in it as anywhere else). Escape, a click outside it or focus leaving it closes it; Escape from inside it puts focus
 * back on the button.
 */
export function Popover({
  button,
  label,
  buttonClassName,
  align = "start",
  panelClassName = "",
  open: controlled,
  onOpenChange,
  children,
}: PopoverProps) {
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const setOpen = (next: boolean) => {
    setOwn(next);
    onOpenChange?.(next);
  };
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    document.getElementById(`${id}-button`)?.focus();
  };

  // A pointer pressed anywhere else closes it, without moving focus.
  const dismiss = useEffectEvent(() => {
    setOpen(false);
  });
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) dismiss();
    };
    // Opened from elsewhere (a shortcut key), focus may not be in it: Escape closes it from anywhere too.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        id={`${id}-button`}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        {...(label && { "aria-label": label })}
        onClick={() => {
          setOpen(!open);
        }}
        className={buttonClassName}
      >
        {button}
      </button>
      <div
        id={id}
        hidden={!open}
        className={`pop-in absolute top-full z-20 mt-1.5 rounded-xl border border-line-strong bg-surface p-1.5 shadow-[0_12px_32px_rgb(0_0_0/0.18)] ${align === "end" ? "right-0" : "left-0"} ${panelClassName}`}
      >
        {open && children(close)}
      </div>
    </div>
  );
}

/** One action in a popover's list. */
export function MenuItem({
  onSelect,
  danger = false,
  children,
}: {
  onSelect: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm whitespace-nowrap hover:bg-fg/6 ${danger ? "text-error-text" : "text-fg"}`}
    >
      {children}
    </button>
  );
}
