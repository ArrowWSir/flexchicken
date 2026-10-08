"use client";
import { useEffect, useRef } from "react";

// Embers drifting up behind the page, in the logo's flame colours. Drawn on
// one canvas from a pre-rendered glow sprite, so it costs a few draw calls a
// frame. Stops when the tab is hidden; not drawn at all for reduced motion.

const COLORS = ["#fcc282", "#f5845c", "#e63e4b", "#d92b2d"];
const AREA_PER_EMBER = 14000; // px² of screen per ember
const MAX_EMBERS = 56;
const SPRITE = 64;

function makeSprite(color) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SPRITE;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
  g.addColorStop(0, "#fff6e8");
  g.addColorStop(0.18, color);
  g.addColorStop(0.5, `${color}55`);
  g.addColorStop(1, `${color}00`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SPRITE, SPRITE);
  return canvas;
}

function spawn(width, height, fromBottom) {
  return {
    x: Math.random() * width,
    y: fromBottom ? height + Math.random() * 40 : Math.random() * height,
    size: 5 + Math.random() * 10,
    speed: 18 + Math.random() * 38, // px/s upward
    sway: 8 + Math.random() * 22,
    phase: Math.random() * Math.PI * 2,
    life: 0,
    maxLife: 5 + Math.random() * 7, // seconds
    sprite: Math.floor(Math.random() * COLORS.length),
  };
}

export default function EmberField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const ctx = canvas.getContext("2d");
    const sprites = COLORS.map(makeSprite);
    let embers = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(MAX_EMBERS, Math.round((width * height) / AREA_PER_EMBER));
      embers = Array.from({ length: count }, () => spawn(width, height, false));
    };

    const draw = (now) => {
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < embers.length; i += 1) {
        const e = embers[i];
        e.life += dt;
        e.y -= e.speed * dt;
        const x = e.x + Math.sin(e.phase + e.life * 1.6) * e.sway;
        // Fade in, glow, fade out as it cools.
        const t = e.life / e.maxLife;
        const alpha = Math.min(1, t * 4) * Math.max(0, 1 - t) * 0.8;
        const size = e.size * (1 - t * 0.5);
        if (t >= 1 || e.y < -20) {
          embers[i] = spawn(width, height, true);
          continue;
        }
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites[e.sprite], x - size, e.y - size, size * 2, size * 2);
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState === "visible") {
        last = 0;
        frame = requestAnimationFrame(draw);
      }
    };

    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 size-full" />;
}
