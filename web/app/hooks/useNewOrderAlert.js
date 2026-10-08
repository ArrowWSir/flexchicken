"use client";
import { useEffect, useRef } from "react";
import { spotFresh } from "../lib/orderAlert";

// Two rising notes, loud enough to hear over a fryer.
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // No audio on this device; the flashing title still shows.
  }
}

const TITLE_FLASH_MS = 4000;

/**
 * Calls `onFresh` with orders in `status` that this screen has not seen.
 * Orders present on first load are treated as already seen; nothing counts
 * until `isLoaded`, so the store's first read is not mistaken for new orders.
 */
export function useFreshOrders(orders, status, onFresh, isLoaded = true) {
  const seen = useRef(null);
  const onFreshRef = useRef(onFresh);
  onFreshRef.current = onFresh;

  useEffect(() => {
    if (!isLoaded) return;
    const matching = orders.filter((o) => o.status === status);
    const result = spotFresh(seen.current, matching.map((o) => o.id));
    seen.current = result.seen;
    if (result.fresh.length) onFreshRef.current(matching.filter((o) => result.fresh.includes(o.id)));
  }, [orders, status, isLoaded]);
}

/**
 * Plays a chime and flashes the tab title when an order with `status`
 * arrives that this screen has not seen.
 */
export default function useNewOrderAlert(orders, { isSoundOn, status = "placed", label = "New order", isLoaded = true }) {
  // The real title is kept while a flash is showing, so two orders in quick
  // succession still put it back.
  const flash = useRef({ timer: null, original: null });
  useEffect(() => () => clearTimeout(flash.current.timer), []);

  useFreshOrders(orders, status, () => {
    if (isSoundOn) chime();
    // Browsers refuse (and log an error) until the page has been tapped once.
    if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.([120, 80, 120]);
    const original = flash.current.original ?? document.title;
    clearTimeout(flash.current.timer);
    document.title = `● ${label}!`;
    const timer = setTimeout(() => {
      document.title = original;
      flash.current = { timer: null, original: null };
    }, TITLE_FLASH_MS);
    flash.current = { timer, original };
  }, isLoaded);
}
