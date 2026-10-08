"use client";
import dynamic from "next/dynamic";

// Leaflet touches `window` when it loads, so the map only renders in the browser.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-surface" />,
});

export default function ShopMap({ height = 220, label, ...props }) {
  return (
    <div
      // A labelled region, not role="img": the map holds focusable zoom buttons.
      role="region"
      aria-label={label}
      className="relative z-0 overflow-hidden rounded-[22px] ring-1 ring-line"
      style={{ height }}
    >
      <LeafletMap {...props} />
    </div>
  );
}
