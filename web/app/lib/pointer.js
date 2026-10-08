// Feeds the pointer position to CSS (--mx / --my) for the spotlight and card
// sheen effects in globals.css. Writes style directly: no React re-render.
export function trackPointer(event) {
  if (event.pointerType !== "mouse") return;
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  el.style.setProperty("--my", `${event.clientY - rect.top}px`);
}
