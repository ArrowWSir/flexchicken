"use client";
import { useEffect, useRef } from "react";

// The chosen category's dishes by name, in two rows that scroll sideways, so
// a phone shows four to six names at once. Names are 14px with 40px-tall
// targets: big enough to read and tap without zooming. Tapping one turns
// the table to it; the active name scrolls into view as the table turns.
export default function ItemRail({ items, activeIndex, onSelect, isReducedMotion }) {
  const listRef = useRef(null);
  const chipRefs = useRef([]);

  // Scroll the rail only, never the page: scrollIntoView would also move the
  // window, jumping the visitor down to the menu on load.
  useEffect(() => {
    const list = listRef.current;
    const chip = chipRefs.current[activeIndex];
    if (!list || !chip) return;
    const left = chip.offsetLeft - list.clientWidth / 2 + chip.offsetWidth / 2;
    list.scrollTo({ left, behavior: isReducedMotion ? "auto" : "smooth" });
  }, [activeIndex, isReducedMotion]);

  // One row is enough for a short category.
  const rows = items.length > 4 ? "grid-rows-2" : "grid-rows-1";

  return (
    <ul
      ref={listRef}
      aria-label="Dishes"
      className={`no-scrollbar scroll-row relative -mx-4 grid ${rows} auto-cols-max grid-flow-col gap-2 overflow-x-auto scroll-px-4 px-4 py-0.5 sm:-mx-8 sm:scroll-px-8 sm:px-8`}
    >
      {items.map((item, i) => {
        const isActive = i === activeIndex;
        return (
          <li key={item.id}>
            <button
              ref={(el) => (chipRefs.current[i] = el)}
              type="button"
              onClick={() => onSelect(i)}
              aria-current={isActive ? "true" : undefined}
              className={`press whitespace-nowrap rounded-full flex h-10 items-center px-4 text-[14px] font-semibold leading-none ${
                isActive
                  ? "bg-roast-800 text-cream shadow-[0_6px_14px_-8px_rgb(45_28_21/0.9)]"
                  : `bg-ground-raised ring-1 ring-line hover:text-ink ${item.isSoldOut ? "text-muted/60 line-through" : "text-muted"}`
              }`}
            >
              {item.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
