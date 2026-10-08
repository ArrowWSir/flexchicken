"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  ChevronLeft,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  LocateFixed,
  Navigation,
  Phone,
  RotateCw,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { describeStep, formatDistance } from "../lib/navigation";
import { formatOrderNumber } from "../lib/orders";
import { useSpokenDirections, useTurnByTurn } from "../hooks/useTurnByTurn";

// Leaflet touches `window` when it loads, so the map only renders in the browser.
const NavMap = dynamic(() => import("../components/map/NavMap"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-roast-800" />,
});

const METRES_PER_MILE = 1609.344;

function TurnIcon({ step, className }) {
  const { type, modifier } = step;
  let Icon = ArrowUp;
  if (type === "arrive") Icon = Flag;
  else if (type === "depart") Icon = Navigation;
  else if (type === "roundabout" || type === "rotary") Icon = RotateCw;
  else if (modifier === "uturn") Icon = Undo2;
  else if (modifier === "slight left") Icon = ArrowUpLeft;
  else if (modifier === "slight right") Icon = ArrowUpRight;
  else if (modifier?.includes("left")) Icon = CornerUpLeft;
  else if (modifier?.includes("right")) Icon = CornerUpRight;
  return <Icon className={className} aria-hidden="true" strokeWidth={2.6} />;
}

// The big card at the top: what to do next, and how far away it is.
function NextTurn({ nav, geo }) {
  const { status, progress, error, retry } = nav;
  let body;
  if (status === "error") {
    body = (
      <div className="grid gap-2">
        <p className="text-[15px] font-semibold">{error}</p>
        <button type="button" onClick={retry} className="press h-11 rounded-xl bg-cream text-[14px] font-bold text-roast-900">
          Try again
        </button>
      </div>
    );
  } else if (!progress) {
    const text = status === "loading" ? "Finding the route…" : (geo.error ?? "Waiting for GPS…");
    body = <p className="py-2 text-[17px] font-semibold">{text}</p>;
  } else {
    const { next, after, metresToNext, isOffRoute } = progress;
    body = (
      <div className="flex items-center gap-3.5">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-go text-white">
          <TurnIcon step={next} className="size-9" />
        </span>
        <div className="min-w-0 flex-1">
          {isOffRoute ? (
            <p className="text-[17px] font-bold leading-snug">Off route. Finding a new way…</p>
          ) : (
            <>
              <p className="font-display text-[30px] font-black leading-none tabular-nums">
                {next.type === "arrive" && metresToNext < 30 ? "Here" : formatDistance(metresToNext)}
              </p>
              <p className="mt-1 text-[16px] font-semibold leading-snug">{describeStep(next)}</p>
            </>
          )}
          {after && !isOffRoute && <p className="mt-1 truncate text-[12.5px] text-cream/60">Then: {describeStep(after)}</p>}
        </div>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="rounded-[22px] bg-roast-950/95 px-4 py-3.5 text-cream shadow-[0_18px_30px_-18px_rgb(0_0_0/0.9)] ring-1 ring-cream/10 backdrop-blur">
      {body}
    </div>
  );
}

function arrivalTime(progress, route) {
  if (!progress || !route) return null;
  const share = route.metres > 0 ? progress.metresLeft / route.metres : 0;
  const seconds = route.durationSeconds * share;
  return { minutes: Math.max(1, Math.round(seconds / 60)), at: new Date(Date.now() + seconds * 1000) };
}

/**
 * Turn-by-turn directions inside the site, so the driver never leaves the
 * page (leaving it stops the location the customer is watching).
 */
export default function NavigationView({ order, geo, onClose, onDelivered }) {
  const nav = useTurnByTurn(true, geo.fix, order.address);
  const [isFollowing, setIsFollowing] = useState(true);
  const [isVoiceOn, setIsVoiceOn] = useState(true);
  useSpokenDirections(nav.progress, isVoiceOn);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const eta = arrivalTime(nav.progress, nav.route);
  const milesLeft = nav.progress ? (nav.progress.metresLeft / METRES_PER_MILE).toFixed(1) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Directions to ${order.customer.name}`}
      className="on-dark fixed inset-0 z-50 flex flex-col bg-roast-950 text-cream"
    >
      <div className="relative min-h-0 flex-1">
        <NavMap
          route={nav.route}
          progress={nav.progress}
          fix={geo.fix}
          destination={order.address}
          isFollowing={isFollowing}
          onStopFollowing={() => setIsFollowing(false)}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] grid gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))]">
          <div className="pointer-events-auto">
            <NextTurn nav={nav} geo={geo} />
          </div>
        </div>
        <div className="absolute bottom-3 right-3 z-[1000] grid gap-2">
          <button
            type="button"
            onClick={() => setIsVoiceOn((on) => !on)}
            aria-pressed={isVoiceOn}
            aria-label={isVoiceOn ? "Voice directions on" : "Voice directions off"}
            className="press flex size-12 items-center justify-center rounded-full bg-roast-950/90 text-cream shadow-lg ring-1 ring-cream/15"
          >
            {isVoiceOn ? <Volume2 className="size-5" aria-hidden="true" /> : <VolumeX className="size-5" aria-hidden="true" />}
          </button>
          {!isFollowing && (
            <button
              type="button"
              onClick={() => setIsFollowing(true)}
              aria-label="Back to my position"
              className="press flex size-12 items-center justify-center rounded-full bg-cream text-roast-900 shadow-lg"
            >
              <LocateFixed className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 border-t border-cream/10 bg-roast-950 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-end justify-between gap-3">
          <p className="min-w-0">
            <span className="block font-display text-[26px] font-black leading-none tabular-nums text-cream">
              {eta ? `${eta.minutes} min` : "–"}
            </span>
            <span className="mt-1 block text-[13px] text-cream/70">
              {eta ? `${milesLeft} mi · arrive ${eta.at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Working out the time"}
            </span>
          </p>
          <p className="min-w-0 text-right text-[12.5px] leading-snug text-cream/70">
            <span className="block font-semibold text-cream">
              {formatOrderNumber(order.number)} · {order.customer.name}
            </span>
            <span className="block truncate">
              {order.address.line1}, {order.address.postcode}
            </span>
          </p>
        </div>
        <div className="grid grid-cols-[auto_1fr_1.4fr] gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to orders"
            className="press flex size-13 items-center justify-center rounded-xl bg-cream/10 text-cream hover:bg-cream/15"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <a
            href={`tel:${(order.customer.phone ?? "").replace(/\s/g, "")}`}
            className="press flex h-13 items-center justify-center gap-2 rounded-xl bg-cream/10 text-[14px] font-bold text-cream hover:bg-cream/15"
          >
            <Phone className="size-4" aria-hidden="true" />
            Call
          </a>
          <button type="button" onClick={onDelivered} className="press h-13 rounded-xl bg-go text-[15px] font-bold text-white hover:bg-go-deep">
            Delivered
          </button>
        </div>
      </div>
    </div>
  );
}
