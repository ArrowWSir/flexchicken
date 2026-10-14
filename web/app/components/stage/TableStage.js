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
// does not re-render while the table turns.

// Geometry, as fractions of the stage width.
const TABLE_X = 0.76;
const FRONT_Y = 0.79; // x stage height: where the front plate stands
const RING = 0.44; // radius of the ring of plates
const OVERHANG = 0.13; // table top beyond the ring
// The camera: table top height / width. table.jpg's brass rim measures
// 1019 x 1556 px (make_table.py RIM), so 0.655 is the owner's own photo.
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
// Depth: nearer settings draw over farther ones; within one setting the mat
// is lowest, then the plate's shadow, the plate, the food's shadow and the food.
const DEPTH_STEPS = 200;
const LAYERS = { mat: 0, plateShadow: 1, plate: 2, dishShadow: 3, dish: 4 };
const LAYER_COUNT = 5;
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
const MOTION_BLUR_PX = 2.4;
const MOTION_BLUR_AT = 6; // dishes/second that reaches full blur

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

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Specks live in the table's space (angle, reach, height above the top), so
// they turn with it and pass behind or in front of dishes by depth.
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

export default function TableStage({ items, activeIndex, onSelect, onStep, isReducedMotion, label }) {
  const stageRef = useRef(null);
  const pedestalRef = useRef(null);
  const rimRef = useRef(null);
  const topRef = useRef(null);
  const lightRef = useRef(null);
  const beamRef = useRef(null);
  const poolRef = useRef(null);
  const plateRefs = useRef([]);
  const plateShadowRefs = useRef([]);
  const matRefs = useRef([]);
  const dishRefs = useRef([]);
  const dishShadowRefs = useRef([]);
  const speckRefs = useRef([]);
  const fits = useRef(new Map()); // image src -> measured food bounds
  const placed = useRef([]);
  const size = useRef({ width: 0, height: 0 });
  // position is measured in dishes: 2.5 = halfway between dish 2 and dish 3.
  const motion = useRef({ position: activeIndex, velocity: 0, target: activeIndex, frame: 0, last: 0 });
  const drag = useRef(null);
  const count = items.length;
  const step = slotStep(count);

  const layout = useCallback(() => {
    const { width, height } = size.current;
    if (!width) return;
    const { position, velocity } = motion.current;
    const ring = width * RING;
    const ringRy = ring * TILT;
    const cx = width * TABLE_X;
    const cy = height * FRONT_Y - ringRy;
    const R = ring + width * OVERHANG;
    const ry = R * TILT;
    const rim = width * RIM_DEPTH;
    const focal = ring * CAMERA_DISTANCE;
    const plateW = width * PLATE;
    const motionBlur = Math.min(MOTION_BLUR_PX, (Math.abs(velocity) / MOTION_BLUR_AT) * MOTION_BLUR_PX);
    const tableAngle = position * step;

    const box = (el, left, top, w, h) => {
      if (!el) return;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    };

    // Top: a top-down disc of the table, turned, then flattened by the camera.
    box(topRef.current, cx - R, cy - R, R * 2, R * 2);
    box(lightRef.current, cx - R, cy - R, R * 2, R * 2);
    // Positive CSS rotation is clockwise on screen, which carries the front of
    // the table to the left: the same way the plates travel round.
    if (topRef.current) topRef.current.style.transform = `scaleY(${TILT}) rotate(${tableAngle}deg)`;
    if (lightRef.current) lightRef.current.style.transform = `scaleY(${TILT})`;
    // Rim: the brass band under the front arc; it slides as the table turns.
    const rimEl = rimRef.current;
    box(rimEl, cx - R, cy, R * 2, ry + rim);
    if (rimEl) {
      rimEl.style.borderRadius = `0 0 ${R}px ${R}px / 0 0 ${ry}px ${ry}px`;
      rimEl.style.backgroundPosition = `0 0, ${-toRad(tableAngle) * R}px 0`;
    }
    // Pedestal: a narrower drum under the table, fading into the dark.
    const pw = R * 2 * PEDESTAL_WIDTH;
    box(pedestalRef.current, cx - pw / 2, cy + ry * 0.6, pw, width * PEDESTAL_HEIGHT);
    // The spotlight lands on the front of the table and leaves a warm pool.
    box(beamRef.current, cx - width * 0.7, 0, width * 1.4, cy + ry);
    box(poolRef.current, cx - R * 0.7, cy - ry * 0.2, R * 1.4, ry * 1.4);

    items.forEach((item, i) => {
      const plate = plateRefs.current[i];
      const dish = dishRefs.current[i];
      const dishShadow = dishShadowRefs.current[i];
      const plateShadow = plateShadowRefs.current[i];
      const mat = matRefs.current[i];
      if (!plate) return;
      const offset = ringOffset(i, position, count);
      const a = toRad(offset * step);
      const z = Math.cos(a); // 1 = nearest the camera
      const scale = focal / (focal + (1 - z) * ring);
      const x = cx + Math.sin(a) * ring;
      const y = cy + z * ringRy;
      const visible = ringVisibility(offset, count);
      const near = (z + 1) / 2;
      const depth = 10 + Math.round(near * DEPTH_STEPS) * LAYER_COUNT;
      const layer = (name) => String(depth + LAYERS[name]);
      const blur = DEPTH_BLUR_PX * (1 - near) ** 1.6 + motionBlur;
      const brightness = 1 - FAR_DIM * (1 - near);
      const saturation = 1 - FAR_DESATURATE * (1 - near);
      const filter = `brightness(${brightness.toFixed(3)}) saturate(${saturation.toFixed(3)})${blur > 0.15 ? ` blur(${blur.toFixed(2)}px)` : ""}`;

      const pw2 = plateW * scale;
      const ph = pw2 * TILT;
      plate.style.transform = `translate3d(${x - pw2 / 2}px, ${y - ph / 2}px, 0)`;
      plate.style.width = `${pw2}px`;
      plate.style.height = `${ph}px`;
      plate.style.zIndex = layer("plate");
      plate.style.opacity = String(visible);
      plate.style.filter = filter;

      if (plateShadow) {
        const sw = pw2 * 1.12;
        plateShadow.style.transform = `translate3d(${x - sw / 2 + pw2 * 0.06}px, ${y - (sw * TILT) / 2 + ph * 0.12}px, 0)`;
        plateShadow.style.width = `${sw}px`;
        plateShadow.style.height = `${sw * TILT}px`;
        plateShadow.style.opacity = String(visible * 0.9);
        plateShadow.style.zIndex = layer("plateShadow");
      }
      if (mat) {
        const mw = pw2 * MAT;
        mat.style.transform = `translate3d(${x - mw / 2}px, ${y - (mw * TILT) / 2}px, 0)`;
        mat.style.width = `${mw}px`;
        mat.style.height = `${mw * MAT_ASPECT * (TILT / PHOTO_TILT)}px`;
        mat.style.zIndex = layer("mat");
        mat.style.opacity = String(visible);
        mat.style.filter = filter;
      }

      // Until its photo is measured the food stays hidden; the plate shows.
      const fit = item.image ? fits.current.get(item.image) : PLACEHOLDER_FIT;
      const foodW = fit ? fit.right - fit.left : 1;
      const foodH = fit ? fit.bottom - fit.top : 1;
      const fill = item.image ? FOOD_FILL : PLACEHOLDER_FILL;
      const dw = Math.min((pw2 * fill) / foodW, (pw2 * FOOD_MAX_HEIGHT) / foodH);
      const base = y + ph * FOOD_BASE;
      if (dish) {
        const centre = fit ? (fit.left + fit.right) / 2 : 0.5;
        dish.style.transform = `translate3d(${x - centre * dw}px, ${base - (fit?.bottom ?? 1) * dw}px, 0)`;
        dish.style.width = `${dw}px`;
        dish.style.height = `${dw}px`;
        dish.style.zIndex = layer("dish");
        dish.style.opacity = String(fit ? visible : 0);
        dish.style.filter = filter;
        dish.style.setProperty("--dw", String(dw));
      }
      if (dishShadow) {
        const sw = Math.min(foodW * dw, pw2 * 0.86) * CONTACT_SHADOW;
        const sh = sw * TILT * 0.5;
        dishShadow.style.transform = `translate3d(${x - sw / 2 + sw * LIGHT_OFFSET}px, ${base - sh * 0.62}px, 0)`;
        dishShadow.style.width = `${sw}px`;
        dishShadow.style.height = `${sh}px`;
        dishShadow.style.zIndex = layer("dishShadow");
        dishShadow.style.opacity = String(fit && item.image ? visible : 0);
      }
      placed.current[i] = { x, y, w: pw2, h: foodH * dw, near, visible };
    });

    SPECKS.forEach((p, i) => {
      const el = speckRefs.current[i];
      if (!el) return;
      const a = toRad(p.theta + tableAngle);
      const z = Math.cos(a);
      const r = p.reach * R;
      const scale = focal / (focal + (1 - z) * r);
      el.style.transform = `translate3d(${cx + Math.sin(a) * r}px, ${cy + z * r * TILT - p.height * width}px, 0) scale(${scale})`;
      el.style.zIndex = String(11 + Math.round(((z + 1) / 2) * DEPTH_STEPS) * LAYER_COUNT);
      el.style.opacity = String(0.35 + 0.65 * ((z + 1) / 2));
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
          <div key={`mat-${item.id}`} ref={(el) => (matRefs.current[i] = el)} className="table-mat table-piece pointer-events-none absolute left-0 top-0" />
        ))}
        {items.map((item, i) => (
          <div key={`shadow-${item.id}`} ref={(el) => (plateShadowRefs.current[i] = el)} className="plate-shadow table-piece pointer-events-none absolute left-0 top-0" />
        ))}
        {items.map((item, i) => (
          <div key={`plate-${item.id}`} ref={(el) => (plateRefs.current[i] = el)} className="plate table-piece pointer-events-none absolute left-0 top-0" />
        ))}
        {items.map((item, i) => (
          <div key={`dish-shadow-${item.id}`} ref={(el) => (dishShadowRefs.current[i] = el)} className="dish-shadow table-piece pointer-events-none absolute left-0 top-0" />
        ))}
        {items.map((item, i) => (
          <div
            key={`dish-${item.id}`}
            ref={(el) => (dishRefs.current[i] = el)}
            data-fly-source={item.id}
            className="table-piece pointer-events-none absolute left-0 top-0 flex items-end justify-center"
          >
            {item.image ? (
              <img src={item.image} alt="" width={720} height={720} draggable={false} className="dish-img size-full object-contain" />
            ) : (
              <span className="mb-[10%] flex size-[34%] items-center justify-center rounded-full bg-cream/15 text-cream/60">
                <UtensilsCrossed className="size-1/2" strokeWidth={1.6} />
              </span>
            )}
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
