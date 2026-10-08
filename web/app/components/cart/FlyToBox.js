"use client";
import { useEffect, useRef } from "react";
import { BOUNCE_KEYFRAMES, FLIGHT_MS, flightKeyframes, isOnScreen } from "../../lib/flight";
import { useCart } from "./CartProvider";

const BOUNCE_MS = 420;
const THUMB_PX = 84; // the dish's size when it has to start from the button
const LANDING_BUZZ_MS = 12;

const pictureIn = (el) => el.querySelector("img") ?? el.firstElementChild;

/**
 * Where the flight starts: the dish (or drink) itself when it is on screen,
 * otherwise a small copy of it rising from the button that added it (the
 * table may be scrolled out of view). Null when there is nothing to fly.
 */
function findSource(id) {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const pictures = [...document.querySelectorAll(`[data-fly-source="${CSS.escape(id)}"]`)].map(pictureIn).filter(Boolean);
  const visible = pictures.find((p) => isOnScreen(p.getBoundingClientRect(), viewport));
  if (visible) return { picture: visible, rect: visible.getBoundingClientRect() };
  const origin = document.querySelector(`[data-fly-origin="${CSS.escape(id)}"]`);
  const button = origin?.getBoundingClientRect();
  if (!pictures[0] || !button || !isOnScreen(button, viewport)) return null;
  const centre = { x: button.left + button.width / 2, y: button.top + button.height / 2 };
  return { picture: pictures[0], rect: { left: centre.x - THUMB_PX / 2, top: centre.y - THUMB_PX / 2, width: THUMB_PX, height: THUMB_PX } };
}

// A copy of the picture, pinned at `rect`, ready to fly.
function launch({ picture, rect }) {
  const flyer = document.createElement("div");
  flyer.setAttribute("aria-hidden", "true");
  flyer.className = "fly-to-box";
  Object.assign(flyer.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  const copy = picture.cloneNode(true);
  Object.assign(copy.style, { width: "100%", height: "100%", margin: "0" });
  flyer.append(copy);
  document.body.append(flyer);
  return flyer;
}

function buzz() {
  // Browsers block vibration before the visitor has touched the page.
  if (navigator.userActivation?.hasBeenActive === false) return;
  navigator.vibrate?.(LANDING_BUZZ_MS);
}

/**
 * Plays the "Add to Box" moment: the dish lifts off its plate, arcs into the
 * Box button and the button bounces as it lands. Renders nothing. Skipped for
 * reduced motion and for "Buy now" (the page moves on).
 */
export default function FlyToBox() {
  const { lastAdded } = useCart();
  const flyers = useRef(new Set());

  useEffect(() => {
    if (!lastAdded || lastAdded.mode === "buy") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = document.querySelector("[data-box-target]");
    const source = findSource(lastAdded.id);
    if (!target || !source) return;

    const flyer = launch(source);
    flyers.current.add(flyer);
    const flight = flyer.animate(flightKeyframes(source.rect, target.getBoundingClientRect()), { duration: FLIGHT_MS, easing: "linear", fill: "forwards" });
    flight.finished
      .then(() => {
        target.animate(BOUNCE_KEYFRAMES, { duration: BOUNCE_MS, easing: "ease-out" });
        buzz();
      })
      // Cancelled when the page unmounts mid-flight: nothing to land.
      .catch(() => {})
      .finally(() => {
        flyer.remove();
        flyers.current.delete(flyer);
      });
    // Each flight finishes on its own; adding twice quickly sends two.
  }, [lastAdded]);

  useEffect(() => {
    const live = flyers.current;
    return () => live.forEach((flyer) => flyer.remove());
  }, []);

  return null;
}
