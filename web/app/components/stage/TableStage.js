"use client";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { UtensilsCrossed } from "lucide-react";
import { ringFocus, ringOffset, ringVisibility, slotStep } from "../../lib/table";
import { measureDish } from "../../lib/dishFit";

// The owner's round travertine table (table.jpg, flattened by
// assets-src/make_table.py) seen from above at the angle of that photo.
// Dishes stand on cream plates in a ring near its edge; the plate at the front
// left is the selected dish. Turning the table turns everything on it: the
// stone, the gold birds, the plates and the food. It sits at the right of the page and runs
// off the frame edge, which crops it.
//
// Positions are computed every frame and written straight to `style`; React
// does not re-render while the table turns.

// Geometry, as fractions of the stage width (height for *_Y).
const TABLE_X = 0.66;
const TABLE_Y = 0.475;
const TABLE_RADIUS = 0.56; // seen from higher the table is taller: this keeps all of it in the stage
// table.jpg's camera: its brass rim is an ellipse 1019 x 1556 px (make_table.py RIM).
const TILT = 0.655;
// The plate and mat photos were taken lower (plate 1.jpg: 516 x 276 px); they
// are stretched up to the table's tilt.
const PHOTO_TILT = 0.535;
const EDGE_DEPTH = 0.04; // thickness of the table top's front edge: thinner seen from higher
const RING = 0.68; // x table radius: where the plates stand
const PLATE = 0.32; // nearest plate's width
// Each plate stands on a round jute mat (public/scene/mat.webp, already at the
// camera's tilt, plus a sliver of braided edge below).
const MAT = 1.16; // x plate width: a band of mat round the plate; the front two plates are ~1.18 apart
const MAT_ASPECT = 0.547; // the mat image's height / width (scene.json matAspect)
// Depth: nearer plates draw over farther ones. Within one place setting the
// mat is lowest, then the plate's shadow, the plate, the food's contact
// shadow and the food.
const DEPTH_STEPS = 200;
const LAYERS = { mat: 0, plateShadow: 1, plate: 2, dishShadow: 3, dish: 4 };
const LAYER_COUNT = 5;
// Food is sized from where it really is in its photo (lib/dishFit), so every
// dish sits on its plate at the same scale whatever the photo's framing.
const FOOD_FILL = 0.72; // food width, x plate width: a rim of plate shows round it
const FOOD_MAX_HEIGHT = 0.82; // x plate width: tall meals (cans, fries) stay in proportion
const FOOD_BASE = 0.1; // food's lowest point, x plate height, in front of the plate centre
// The light is at the back left of the table (see .table-light), so shadows
// fall forward and to the right.
const CONTACT_SHADOW = 0.92; // x food width
const LIGHT_OFFSET = 0.05; // x food width, rightward
const PLACEHOLDER_FIT = { left: 0.33, right: 0.67, top: 0.56, bottom: 0.9 }; // the "no photo" icon
const PLACEHOLDER_FILL = 0.4; // x plate width
const SELECTED_ANGLE = -26; // degrees from the front; negative = towards the page
const CAMERA_DISTANCE = 2.6; // x ring radius; closer = stronger perspective
const DEPTH_BLUR_PX = 1.8;
// The selected place setting and its neighbour stand at mirror angles, so
// perspective alone draws them the same. Focus sets the selected one apart:
// it grows, draws over its neighbours, and the rest of the table steps back.
// Focus eases in as a dish turns to the front, so it travels with the table.
// Kept light: heavy dimming turned the cream plates grey and the food dull.
const FOCUS_SCALE = 0.2; // extra size at full focus
const UNFOCUS_DIM = 0.06; // brightness taken from dishes out of focus
const UNFOCUS_DESATURATE = 0.08;
const UNFOCUS_BLUR_PX = 0.5;
const FAR_DIM = 0.1; // brightness taken from the back of the table
const FAR_DESATURATE = 0.08;
const MOTION_BLUR_PX = 2.4;
const MOTION_BLUR_AT = 6; // items/second that reaches full blur

// Motion.
const SPRING_STIFFNESS = 90;
const SPRING_DAMPING = 18;
const DRAG_PX_PER_ITEM = 0.34; // x stage width
const FLICK_PROJECTION_S = 0.14;
const TAP_SLOP_PX = 6;
const ARRIVE_FROM = 2.4; // a new category's plates roll in from this far round

const toRad = (deg) => (deg * Math.PI) / 180;

export default function TableStage({ items, activeIndex, onSelect, onStep, isReducedMotion, label }) {
  const stageRef = useRef(null);
  const topRef = useRef(null);
  const lightRef = useRef(null);
  const edgeRef = useRef(null);
  const shadowRef = useRef(null);
  const plateRefs = useRef([]);
  const plateShadowRefs = useRef([]);
  const matRefs = useRef([]);
  const dishRefs = useRef([]);
  const dishShadowRefs = useRef([]);
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
    const cx = width * TABLE_X;
    const cy = height * TABLE_Y;
    const R = width * TABLE_RADIUS;
    const ry = R * TILT;
    const ring = R * RING;
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
    // Edge: the brass band under the front arc; it slides as the table turns.
    const edge = width * EDGE_DEPTH;
    const edgeEl = edgeRef.current;
    box(edgeEl, cx - R, cy, R * 2, ry + edge);
    if (edgeEl) {
      edgeEl.style.borderRadius = `0 0 ${R}px ${R}px / 0 0 ${ry}px ${ry}px`;
      edgeEl.style.backgroundPosition = `0 0, ${-toRad(tableAngle) * R}px 0`;
    }
    box(shadowRef.current, cx - R * 1.05, cy + ry * 0.35, R * 2.1, ry * 1.6);

    items.forEach((item, i) => {
      const plate = plateRefs.current[i];
      const dish = dishRefs.current[i];
      const dishShadow = dishShadowRefs.current[i];
      const plateShadow = plateShadowRefs.current[i];
      const mat = matRefs.current[i];
      if (!plate) return;
      const offset = ringOffset(i, position, count);
      const a = toRad(SELECTED_ANGLE + offset * step);
      const z = Math.cos(a); // 1 = nearest the camera
      const focus = ringFocus(offset);
      const unfocus = 1 - focus;
      const scale = (focal / (focal + (1 - z) * ring)) * (1 + FOCUS_SCALE * focus);
      const x = cx + Math.sin(a) * ring;
      const y = cy + z * ring * TILT;
      const visible = ringVisibility(offset, count);
      const near = (z + 1) / 2;
      // Focus outranks nearness, so the grown plate covers the one beside it.
      const depth = 10 + Math.round(((near + focus) / 2) * DEPTH_STEPS) * LAYER_COUNT;
      const layer = (name) => String(depth + LAYERS[name]);
      const blur = DEPTH_BLUR_PX * (1 - near) ** 1.5 + UNFOCUS_BLUR_PX * unfocus + motionBlur;
      const brightness = (1 - FAR_DIM * (1 - near)) * (1 - UNFOCUS_DIM * unfocus);
      const saturation = (1 - FAR_DESATURATE * (1 - near)) * (1 - UNFOCUS_DESATURATE * unfocus);
      const filter = `brightness(${brightness.toFixed(3)}) saturate(${saturation.toFixed(3)})${blur > 0.15 ? ` blur(${blur.toFixed(2)}px)` : ""}`;

      const pw = plateW * scale;
      const ph = pw * TILT;
      plate.style.transform = `translate3d(${x - pw / 2}px, ${y - ph / 2}px, 0)`;
      plate.style.width = `${pw}px`;
      plate.style.height = `${ph}px`;
      plate.style.zIndex = layer("plate");
      plate.style.opacity = String(visible);
      plate.style.filter = filter;

      if (plateShadow) {
        const sw = pw * 1.12;
        plateShadow.style.transform = `translate3d(${x - sw / 2 + pw * 0.06}px, ${y - (sw * TILT) / 2 + ph * 0.12}px, 0)`;
        plateShadow.style.width = `${sw}px`;
        plateShadow.style.height = `${sw * TILT}px`;
        plateShadow.style.opacity = String(visible * 0.9);
        plateShadow.style.zIndex = layer("plateShadow");
      }
      if (mat) {
        const mw = pw * MAT;
        mat.style.transform = `translate3d(${x - mw / 2}px, ${y - (mw * TILT) / 2}px, 0)`;
        mat.style.width = `${mw}px`;
        mat.style.height = `${mw * MAT_ASPECT * (TILT / PHOTO_TILT)}px`;
        mat.style.zIndex = layer("mat");
        mat.style.opacity = String(visible);
        mat.style.filter = filter;
      }

      // Until its photo is measured the food stays hidden; the plate shows.
      const fit = item.image ? fits.current.get(item.image) : PLACEHOLDER_FIT;
      const foodW = fit ? (fit.right - fit.left) : 1;
      const foodH = fit ? (fit.bottom - fit.top) : 1;
      // Image size that makes the food FOOD_FILL of the plate, capped by height.
      const fill = item.image ? FOOD_FILL : PLACEHOLDER_FILL;
      const dw = Math.min((pw * fill) / foodW, (pw * FOOD_MAX_HEIGHT) / foodH);
      const base = y + ph * FOOD_BASE;
      if (dish) {
        const centre = fit ? (fit.left + fit.right) / 2 : 0.5;
        dish.style.transform = `translate3d(${x - centre * dw}px, ${base - (fit?.bottom ?? 1) * dw}px, 0)`;
        dish.style.width = `${dw}px`;
        dish.style.height = `${dw}px`;
        dish.style.zIndex = layer("dish");
        dish.style.opacity = String(fit ? visible : 0);
        // Warm the studio photo a touch toward the table's light.
        dish.style.filter = `${filter} sepia(0.06)`;
        dish.style.setProperty("--dw", String(dw));
      }
      if (dishShadow) {
        // Where the food meets the plate: a soft dark pool, nudged away from the light.
        const sw = Math.min(foodW * dw, pw * 0.86) * CONTACT_SHADOW;
        const sh = sw * TILT * 0.5;
        dishShadow.style.transform = `translate3d(${x - sw / 2 + sw * LIGHT_OFFSET}px, ${base - sh * 0.62}px, 0)`;
        dishShadow.style.width = `${sw}px`;
        dishShadow.style.height = `${sh}px`;
        dishShadow.style.zIndex = layer("dishShadow");
        dishShadow.style.opacity = String(fit && item.image ? visible : 0);
      }
      placed.current[i] = { x, y, w: pw, h: foodH * dw, near, visible };
    });
  }, [items, count, step]);

  // The running animation loop must always draw the latest dishes: a frame
  // scheduled before a category change would otherwise lay out the old list.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const tick = useCallback(
    (now) => {
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
    },
    []
  );

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
      className="absolute inset-0 cursor-grab touch-pan-y select-none rounded-[28px] active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      <div ref={shadowRef} className="table-shadow pointer-events-none absolute" aria-hidden="true" />
      <div ref={edgeRef} className="table-edge pointer-events-none absolute" aria-hidden="true" />
      <div ref={topRef} className="table-top pointer-events-none absolute rounded-full" aria-hidden="true" />
      <div ref={lightRef} className="table-light pointer-events-none absolute rounded-full" aria-hidden="true" />

      <div key={items[0]?.categoryId} className="dish-layer" aria-hidden="true">
        {items.map((item, i) => (
          <div
            key={`mat-${item.id}`}
            ref={(el) => (matRefs.current[i] = el)}
            className="table-mat table-piece pointer-events-none absolute left-0 top-0"
          />
        ))}
        {items.map((item, i) => (
          <div
            key={`shadow-${item.id}`}
            ref={(el) => (plateShadowRefs.current[i] = el)}
            className="plate-shadow table-piece pointer-events-none absolute left-0 top-0"
          />
        ))}
        {items.map((item, i) => (
          <div
            key={`plate-${item.id}`}
            ref={(el) => (plateRefs.current[i] = el)}
            className="plate table-piece pointer-events-none absolute left-0 top-0"
          />
        ))}
        {items.map((item, i) => (
          <div
            key={`dish-shadow-${item.id}`}
            ref={(el) => (dishShadowRefs.current[i] = el)}
            className="dish-shadow table-piece pointer-events-none absolute left-0 top-0"
          />
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
              <span className="mb-[10%] flex size-[34%] items-center justify-center rounded-full bg-roast-800/10 text-roast-700/50">
                <UtensilsCrossed className="size-1/2" strokeWidth={1.6} />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
