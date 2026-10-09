"use client";
import { useEffect, useRef } from "react";
import manifest from "../../public/backdrop/manifest.json";
import { fitByHeight, frameAt, loadOrder, nearestLoaded, scrollEnd } from "../lib/backdrop";

// Behind the customer pages: a plate of wings, hands reaching in, emptied as
// the visitor scrolls down and filled again as they scroll back. The frames
// are transparent (the grey table keyed out by scripts/build-backdrop.py), so
// the page's own cream shows through. Reduced motion or Save-Data: one still
// frame, nothing more is downloaded.

const EASE = 0.22; // share of the gap to the scroll frame covered each paint
const EDGE_FADE = 0.22; // on wide screens, fade the column's sides (arms cut there)
const PARALLEL_LOADS = 6;

const frameUrl = (i) => manifest.pattern.replace("{i}", String(i).padStart(3, "0"));

function fadeSides(ctx, rect) {
  const g = ctx.createLinearGradient(rect.x, 0, rect.x + rect.width, 0);
  g.addColorStop(0, "rgb(0 0 0 / 0)");
  g.addColorStop(EDGE_FADE, "rgb(0 0 0 / 1)");
  g.addColorStop(1 - EDGE_FADE, "rgb(0 0 0 / 1)");
  g.addColorStop(1, "rgb(0 0 0 / 0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, 0, rect.width, rect.height);
  ctx.globalCompositeOperation = "source-over";
}

export default function PlateBackdrop() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const isStill =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches || Boolean(navigator.connection?.saveData);
    const images = new Array(manifest.count).fill(null);
    const loaded = new Array(manifest.count).fill(false);
    let width = 0;
    let height = 0;
    let shown = -1; // frame on the canvas
    let current = 0; // eased position, in frames
    let raf = 0;
    let isAlive = true;

    const paint = (index) => {
      const at = nearestLoaded(index, loaded);
      if (at === -1 || at === shown) return;
      const rect = fitByHeight(width, height, manifest.width, manifest.height);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(images[at], rect.x, rect.y, rect.width, rect.height);
      if (rect.isNarrower) fadeSides(ctx, rect);
      shown = at;
    };

    const target = () => {
      if (isStill) return 0;
      // Read each time: the menu folds open and closes, moving the footer.
      const footer = document.getElementById("contact");
      const max = scrollEnd({
        scrollHeight: document.documentElement.scrollHeight,
        viewHeight: window.innerHeight,
        footerTop: footer ? footer.getBoundingClientRect().top + window.scrollY : null,
      });
      return frameAt(window.scrollY, max, manifest.count);
    };

    const tick = () => {
      raf = 0;
      const goal = target();
      current += (goal - current) * EASE;
      if (Math.abs(goal - current) < 0.5) current = goal;
      paint(Math.round(current));
      if (current !== goal) raf = requestAnimationFrame(tick);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingQuality = "high";
      shown = -1;
      paint(Math.round(current));
    };

    const load = (i) =>
      new Promise((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.src = frameUrl(i);
        img
          .decode()
          .then(() => {
            if (!isAlive) return;
            images[i] = img;
            loaded[i] = true;
            shown = -1; // a closer frame may have arrived
            schedule();
          })
          // A missing frame only means a neighbour is shown instead.
          .catch(() => {})
          .finally(resolve);
      });

    const loadAll = async () => {
      const queue = isStill ? [0] : loadOrder(manifest.count);
      const worker = async () => {
        while (isAlive && queue.length) await load(queue.shift());
      };
      await Promise.all(Array.from({ length: PARALLEL_LOADS }, worker));
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    current = target();
    loadAll();
    if (!isStill) window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      isAlive = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh w-full" />;
}
