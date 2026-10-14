"use client";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { UtensilsCrossed } from "lucide-react";
import { ringOffset, ringVisibility, slotStep } from "../../lib/table";
import { measureDish } from "../../lib/dishFit";

// The owner's round travertine table (table.jpg, flattened by
// assets-src/make_table.py) inside the menu card, laid out like a shop
// window: the dish's name on the left, the table standing right of centre and
// running off the card's edge, lit by one spotlight from above. Dishes stand on
// cream plates and jute mats round the table's edge; the one nearest the
// camera is the chosen dish. Turning the table turns everything on it.
//
// Positions are computed every frame and written straight to `style`; React
// does not re-render while the table turns. To hold 60 frames a second a
// frame only moves things:
// - each place setting (mat, shadows, plate, food) is one group, sized once
//   for the front of the table, then placed and scaled with `transform`,
//   which the graphics chip does without repainting;
// - styles are written only when they change (see `put`), and the depth cues
//   change in steps, so a turn repaints a setting a few times, not every frame;
// - the specks of seasoning hang still in the light while the table turns.

// Geometry, as fractions of the stage width.
const TABLE_X = 0.76;
const FRONT_Y = 0.76; // x stage height: where the front plate stands
const DESIGN_ASPECT = 0.8; // stage height / width the sizes below were set for
const SIZE = 1.12; // the table and everything on it, x the size that just fits the card
const RING = 0.44; // radius of the ring of plates
const OVERHANG = 0.13; // table top beyond the ring
// The camera: table top height / width. Lower than table.jpg (0.655) so the
// dishes stand on the table, as in a shop window.
const TILT = 0.42;
// The plate and mat photos were taken lower (plate 1.jpg: 516 x 276 px); they
// are stretched to the table's tilt.
const PHOTO_TILT = 0.535;
const RIM_DEPTH = 0.026; // the brass band round the top
const PEDESTAL_WIDTH = 0.42; // x table diameter
const PEDESTAL_HEIGHT = 0.45; // it fades out well before this
const PLATE = 0.5; // nearest plate's width
const MAT = 1.16; // x plate width: a band of jute round the plate
const MAT_ASPECT = 0.547; // the mat image's height / width (scene.json matAspect)
const CAMERA_DISTANCE = 2.4; // x ring radius; closer = stronger perspective
// Nearer settings draw over farther ones; inside a setting the order is the
// markup's: mat, plate shadow, plate, food shadow, food.
const DEPTH_STEPS = 200;
// Food is sized from where it really is in its photo (lib/dishFit), so every
// dish sits on its plate at the same scale whatever the photo's framing.
const FOOD_FILL = 0.72; // food width, x plate width
const FOOD_MAX_HEIGHT = 0.82; // x plate width: tall meals stay in proportion
const FOOD_BASE = 0.1; // food's lowest point, x plate height, in front of the plate centre
const CONTACT_SHADOW = 0.92; // x food width
const LIGHT_OFFSET = 0.05; // shadows fall right, away from the light at the upper left
const PLACEHOLDER_FIT = { left: 0.33, right: 0.67, top: 0.56, bottom: 0.9 };
const PLACEHOLDER_FILL = 0.4;
// Depth cues, kept light: the back of the table is a little dimmer and softly
// out of focus, never grey.
const FAR_DIM = 0.16;
const FAR_DESATURATE = 0.1;
const DEPTH_BLUR_PX = 2;
const DEPTH_CUE_STEPS = 6; // nearness is rounded to this many steps for the filters

// Spotlight specks: seasoning in the light. Seeded, so server and client agree.
const SPECK_COUNT = 22;

// Motion.
const SPRING_STIFFNESS = 90;
const SPRING_DAMPING = 18;
const DRAG_PX_PER_ITEM = 0.36; // x stage width
const FLICK_PROJECTION_S = 0.14;
const TAP_SLOP_PX = 6;
const ARRIVE_FROM = 2.4; // a new category's plates roll in from this far round

const toRad = (deg) => (deg * Math.PI) / 180;

// Writes a style only when it changed: even an unchanged write makes the
// browser recheck the element, and a changed filter or size repaints it.
function put(el, prop, value) {
  if (!el) return;
  const last = (el.__tableStyle ??= {});
  if (last[prop] === value) return;
  last[prop] = value;
  if (prop.startsWith("--")) el.style.setProperty(prop, value);
  else el.style[prop] = value;
}

/** Sets an element's box, in px, relative to its positioned parent. */
function box(el, left, top, w, h) {
  put(el, "left", `${left}px`);
  put(el, "top", `${top}px`);
  put(el, "width", `${w}px`);
  put(el, "height", `${h}px`);
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Specks hang in the air over the table (angle, reach, height above the top).
const SPECKS = (() => {
  const rand = seeded(11);
  return Array.from({ length: SPECK_COUNT }, () => ({
    theta: rand() * 360,
    reach: 0.15 + rand() * 0.95,
    height: 0.04 + rand() * 0.38,
    size: 1.5 + rand() * 2.4,
    delay: (rand() * 4).toFixed(2),
    duration: (2.2 + rand() * 2.8).toFixed(2),
  }));
})();

/**
 * Sizes one place setting's pieces for the front of the table, around the
 * point the setting stands on (the group's origin). Only runs when the card
 * resizes or a photo is measured; `put` skips it otherwise.
 */
function sizeSetting(parts, plateW, fit, hasImage) {
  const ph = plateW * TILT;
  const mw = plateW * MAT;
  box(parts.mat, -mw / 2, -(mw * TILT) / 2, mw, mw * MAT_ASPECT * (TILT / PHOTO_TILT));
  const sw = plateW * 1.12;
  box(parts.plateShadow, -sw / 2 + plateW * 0.06, -(sw * TILT) / 2 + ph * 0.12, sw, sw * TILT);
  box(parts.plate, -plateW / 2, -ph / 2, plateW, ph);

  // Until its photo is measured the food stays hidden; the plate shows.
  const foodW = fit ? fit.right - fit.left : 1;
  const foodH = fit ? fit.bottom - fit.top : 1;
  const fill = hasImage ? FOOD_FILL : PLACEHOLDER_FILL;
  const dw = Math.min((plateW * fill) / foodW, (plateW * FOOD_MAX_HEIGHT) / foodH);
  const base = ph * FOOD_BASE;
  const centre = fit ? (fit.left + fit.right) / 2 : 0.5;
  box(parts.dish, -centre * dw, base - (fit?.bottom ?? 1) * dw, dw, dw);
  put(parts.dish, "--dw", String(dw));
  put(parts.dish, "opacity", fit ? "1" : "0");
  const dsw = Math.min(foodW * dw, plateW * 0.86) * CONTACT_SHADOW;
  const dsh = dsw * TILT * 0.5;
  box(parts.dishShadow, -dsw / 2 + dsw * LIGHT_OFFSET, base - dsh * 0.62, dsw, dsh);
  put(parts.dishShadow, "opacity", fit && hasImage ? "1" : "0");
  return foodH * dw;
}

export default function TableStage({ items, activeIndex, onSelect, onStep, isReducedMotion, label }) {
  const stageRef = useRef(null);
  const pedestalRef = useRef(null);
  const rimRef = useRef(null);
  const topRef = useRef(null);
  const lightRef = useRef(null);
  const beamRef = useRef(null);
  const poolRef = useRef(null);
  const settingRefs = useRef([]); // per dish: { group, mat, plateShadow, plate, dishShadow, dish }
  const speckRefs = useRef([]);
  const fits = useRef(new Map()); // image src -> measured food bounds
  const placed = useRef([]);
  const size = useRef({ width: 0, height: 0 });
  // position is measured in dishes: 2.5 = halfway between dish 2 and dish 3.
  const motion = useRef({ position: activeIndex, velocity: 0, target: activeIndex, frame: 0, last: 0 });
  const drag = useRef(null);
  const count = items.length;
  const step = slotStep(count);

  const part = (i, name) => (el) => {
    settingRefs.current[i] = { ...settingRefs.current[i], [name]: el };
  };

  const layout = useCallback(() => {
    const { width, height } = size.current;
    if (!width) return;
    const { position } = motion.current;
    // Sized to the card: in one shorter than the design, the whole table shrinks to fit.
    const unit = width * Math.min(1, height / (width * DESIGN_ASPECT)) * SIZE;
    const ring = unit * RING;
    const ringRy = ring * TILT;
    const cx = width * TABLE_X;
    const cy = height * FRONT_Y - ringRy;
    const R = ring + unit * OVERHANG;
    const ry = R * TILT;
    const rim = unit * RIM_DEPTH;
    const focal = ring * CAMERA_DISTANCE;
    const plateW = unit * PLATE;
    const tableAngle = position * step;

    // Top: a top-down disc of the table, turned, then flattened by the camera.
    box(topRef.current, cx - R, cy - R, R * 2, R * 2);
    box(lightRef.current, cx - R, cy - R, R * 2, R * 2);
    // Positive CSS rotation is clockwise on screen, which carries the front of
    // the table to the left: the same way the plates travel round.
    put(topRef.current, "transform", `scaleY(${TILT}) rotate(${tableAngle.toFixed(3)}deg)`);
    put(lightRef.current, "transform", `scaleY(${TILT})`);
    // Rim: the brass band under the front arc; it slides as the table turns.
    const rimEl = rimRef.current;
    box(rimEl, cx - R, cy, R * 2, ry + rim);
    put(rimEl, "borderRadius", `0 0 ${R}px ${R}px / 0 0 ${ry}px ${ry}px`);
    put(rimEl, "backgroundPosition", `0 0, ${(-toRad(tableAngle) * R).toFixed(1)}px 0`);
    // Pedestal: a narrower drum under the table, fading into the dark.
    const pw = R * 2 * PEDESTAL_WIDTH;
    box(pedestalRef.current, cx - pw / 2, cy + ry * 0.6, pw, width * PEDESTAL_HEIGHT);
    // The spotlight lands on the front of the table and leaves a warm pool.
    box(beamRef.current, cx - width * 0.7, 0, width * 1.4, cy + ry);
    box(poolRef.current, cx - R * 0.7, cy - ry * 0.2, R * 1.4, ry * 1.4);

    items.forEach((item, i) => {
      const parts = settingRefs.current[i];
      if (!parts?.group) return;
      const fit = item.image ? fits.current.get(item.image) : PLACEHOLDER_FIT;
      const foodH = sizeSetting(parts, plateW, fit, Boolean(item.image));

      const offset = ringOffset(i, position, count);
      const a = toRad(offset * step);
      const z = Math.cos(a); // 1 = nearest the camera
      const scale = focal / (focal + (1 - z) * ring);
      const x = cx + Math.sin(a) * ring;
      const y = cy + z * ringRy;
      const visible = ringVisibility(offset, count);
      const near = (z + 1) / 2;
      // In steps, so a setting is repainted a few times per turn, not every frame.
      const cue = 1 - Math.round(near * DEPTH_CUE_STEPS) / DEPTH_CUE_STEPS;
      const blur = DEPTH_BLUR_PX * cue ** 1.6;
      put(parts.group, "transform", `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`);
      put(parts.group, "zIndex", String(10 + Math.round(near * DEPTH_STEPS)));
      put(parts.group, "opacity", visible.toFixed(3));
      put(
        parts.group,
        "filter",
        `brightness(${(1 - FAR_DIM * cue).toFixed(3)}) saturate(${(1 - FAR_DESATURATE * cue).toFixed(3)})${blur > 0.15 ? ` blur(${blur.toFixed(2)}px)` : ""}`
      );
      placed.current[i] = { x, y, w: plateW * scale, h: foodH * scale, near, visible };
    });

    SPECKS.forEach((p, i) => {
      const el = speckRefs.current[i];
      if (!el) return;
      const a = toRad(p.theta);
      const z = Math.cos(a);
      const r = p.reach * R;
      const scale = focal / (focal + (1 - z) * r);
      put(el, "transform", `translate3d(${(cx + Math.sin(a) * r).toFixed(2)}px, ${(cy + z * r * TILT - p.height * width).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`);
      put(el, "zIndex", String(11 + Math.round(((z + 1) / 2) * DEPTH_STEPS)));
      put(el, "opacity", (0.35 + 0.65 * ((z + 1) / 2)).toFixed(2));
    });
  }, [items, count, step]);

  // The running animation loop must always draw the latest dishes: a frame
  // scheduled before a category change would otherwise lay out the old list.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const tick = useCallback((now) => {
    const m = motion.current;
    const dt = Math.min(0.032, (now - (m.last || now)) / 1000);
    m.last = now;
    if (!drag.current) {
      const force = -SPRING_STIFFNESS * (m.position - m.target) - SPRING_DAMPING * m.velocity;
      m.velocity += force * dt;
      m.position += m.velocity * dt;
      if (Math.abs(m.position - m.target) < 0.001 && Math.abs(m.velocity) < 0.01) {
        m.position = m.target;
        m.velocity = 0;
        layoutRef.current();
        m.frame = 0;
        return;
      }
    }
    layoutRef.current();
    m.frame = requestAnimationFrame(tick);
  }, []);

  const run = useCallback(() => {
    const m = motion.current;
    if (!m.frame) {
      m.last = 0;
      m.frame = requestAnimationFrame(tick);
    }
  }, [tick]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    const observer = new ResizeObserver(([entry]) => {
      size.current = { width: entry.contentRect.width, height: entry.contentRect.height };
      layout();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [layout]);

  // Measure each photo once; the dish appears as soon as its size is known.
  useEffect(() => {
    let isLive = true;
    items.forEach((item) => {
      if (!item.image || fits.current.has(item.image)) return;
      measureDish(item.image).then((fit) => {
        if (!isLive) return;
        fits.current.set(item.image, fit);
        layout();
      });
    });
    return () => {
      isLive = false;
    };
  }, [items, layout]);

  // A new category: its plates roll round into place rather than appearing.
  useLayoutEffect(() => {
    const m = motion.current;
    m.target = activeIndex;
    m.position = isReducedMotion || count < 2 ? activeIndex : activeIndex + ARRIVE_FROM;
    m.velocity = 0;
    layout();
    run();
    // Only when the set of dishes changes; selection changes animate below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Turn to the selected dish by the shortest way round.
  useEffect(() => {
    const m = motion.current;
    m.target = m.position + ringOffset(activeIndex, m.position, count);
    if (isReducedMotion) {
      m.position = m.target;
      m.velocity = 0;
      layout();
      return;
    }
    run();
  }, [activeIndex, count, isReducedMotion, layout, run]);

  useEffect(() => {
    const m = motion.current;
    return () => {
      cancelAnimationFrame(m.frame);
      m.frame = 0;
    };
  }, []);

  const dishAt = (event) => {
    const rect = stageRef.current.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const hits = placed.current
      .map((p, i) => ({ ...p, i }))
      .filter((p) => p.visible > 0.5 && Math.abs(px - p.x) < p.w * 0.55 && py < p.y + p.w * 0.3 && py > p.y - p.h * 0.75)
      .sort((a, b) => b.near - a.near);
    return hits.length ? hits[0].i : null;
  };

  const handlePointerDown = (event) => {
    drag.current = {
      startX: event.clientX,
      startPosition: motion.current.position,
      lastX: event.clientX,
      lastT: performance.now(),
      moved: false,
      pressedIndex: dishAt(event),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.startX;
    if (Math.abs(dx) > TAP_SLOP_PX) d.moved = true;
    if (!d.moved) return;
    const itemsPerPx = 1 / (size.current.width * DRAG_PX_PER_ITEM);
    const m = motion.current;
    const now = performance.now();
    // Dragging left brings the next dish round to the front.
    m.velocity = (-(event.clientX - d.lastX) * itemsPerPx) / Math.max(0.001, (now - d.lastT) / 1000);
    m.position = d.startPosition - dx * itemsPerPx;
    d.lastX = event.clientX;
    d.lastT = now;
    layout();
  };

  const handlePointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      if (d.pressedIndex !== null && d.pressedIndex !== activeIndex) onSelect(d.pressedIndex);
      return;
    }
    const m = motion.current;
    const landing = Math.round(m.position + m.velocity * FLICK_PROJECTION_S);
    const index = ((landing % count) + count) % count;
    if (index === activeIndex) {
      m.target = m.position + ringOffset(index, m.position, count);
      run();
    } else {
      onSelect(index);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onStep(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      onStep(-1);
    }
  };

  return (
    <div
      ref={stageRef}
      role="group"
      aria-roledescription="turning table"
      aria-label={`${label}. Drag, or use the arrow keys, to turn the table.`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="absolute inset-0 cursor-grab touch-pan-y select-none active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      <div ref={pedestalRef} className="table-pedestal pointer-events-none absolute" aria-hidden="true" />
      <div ref={rimRef} className="table-edge pointer-events-none absolute" aria-hidden="true" />
      <div ref={topRef} className="table-top pointer-events-none absolute rounded-full" aria-hidden="true" />
      <div ref={lightRef} className="table-light pointer-events-none absolute rounded-full" aria-hidden="true" />
      <div ref={poolRef} className="spot-pool pointer-events-none absolute" aria-hidden="true" />

      <div key={items[0]?.categoryId} className="dish-layer" aria-hidden="true">
        {items.map((item, i) => (
          <div key={item.id} ref={part(i, "group")} className="table-setting pointer-events-none absolute left-0 top-0">
            <div ref={part(i, "mat")} className="table-mat absolute" />
            <div ref={part(i, "plateShadow")} className="plate-shadow absolute" />
            <div ref={part(i, "plate")} className="plate absolute" />
            <div ref={part(i, "dishShadow")} className="dish-shadow absolute" />
            <div ref={part(i, "dish")} data-fly-source={item.id} className="absolute flex items-end justify-center opacity-0">
              {item.image ? (
                <img src={item.image} alt="" width={720} height={720} draggable={false} className="dish-img size-full object-contain" />
              ) : (
                <span className="mb-[10%] flex size-[34%] items-center justify-center rounded-full bg-cream/15 text-cream/60">
                  <UtensilsCrossed className="size-1/2" strokeWidth={1.6} />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div ref={beamRef} className="spot-beam pointer-events-none absolute" aria-hidden="true" />
      {SPECKS.map((p, i) => (
        <span
          key={`speck-${i}`}
          ref={(el) => (speckRefs.current[i] = el)}
          className={`speck pointer-events-none absolute left-0 top-0${p.size > 3.2 ? " speck--glint" : ""}`}
          style={{ width: `${p.size}px`, height: `${p.size}px`, "--delay": `${p.delay}s`, "--duration": `${p.duration}s` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
