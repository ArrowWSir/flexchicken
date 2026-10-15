"use client";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { Beef, CupSoda, Drumstick, Flame, FlameKindling, Hamburger, Package, Popcorn, Salad, Sandwich, Utensils } from "lucide-react";

const ICONS = {
  drumstick: Drumstick,
  utensils: Utensils,
  burger: Hamburger,
  "burger-meal": Sandwich,
  box: Package,
  flame: Flame,
  grill: FlameKindling,
  bbq: Beef,
  popcorn: Popcorn,
  salad: Salad,
  cup: CupSoda,
};

const MAX_TILT_DEG = 14;
const TILT_SPRING = { stiffness: 260, damping: 20, mass: 0.6 };

/**
 * One category as an enamel disc in a metal ring. Tilts toward the pointer on
 * desktop (Motion springs), sweeps a light band across on a loop, and lights
 * its ring red when chosen.
 */
export default function ShinyBadge({ category, image, isActive, onSelect, sweepDelay }) {
  const isReduced = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [MAX_TILT_DEG, -MAX_TILT_DEG]), TILT_SPRING);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-MAX_TILT_DEG, MAX_TILT_DEG]), TILT_SPRING);
  const Icon = ICONS[category.icon] ?? Utensils;

  const handleMove = (event) => {
    if (isReduced || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  };
  const reset = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      aria-pressed={isActive}
      whileTap={isReduced ? undefined : { scale: 0.93 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      className="badge-button group flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-0.5 pb-1 pt-1 [perspective:600px]"
    >
      <motion.span
        className="badge-ring relative block aspect-square w-full max-w-[84px] rounded-full p-[7%]"
        data-active={isActive}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d", "--sweep-delay": `${sweepDelay}s` }}
        animate={isReduced ? undefined : { scale: isActive ? 1.06 : 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 24 }}
      >
        <span className="badge-enamel flex size-full items-center justify-center rounded-full" data-active={isActive}>
          {image ? (
            <img
              src={image}
              alt=""
              width={264}
              height={264}
              loading="lazy"
              draggable={false}
              className="relative z-[2] size-full object-contain drop-shadow-[0_3px_4px_rgb(45_28_21/0.35)]"
            />
          ) : (
            <Icon
              className={`relative z-[1] size-[42%] ${isActive ? "text-flame-light" : "text-roast-700"}`}
              strokeWidth={1.7}
              aria-hidden="true"
            />
          )}
        </span>
      </motion.span>
      <span
        className={`text-center text-[clamp(10px,2.9vw,12.5px)] font-semibold leading-tight tracking-[0.01em] transition-colors ${
          isActive ? "text-flex-ink" : "text-ink group-hover:text-flex-ink"
        }`}
      >
        {category.short}
      </span>
    </motion.button>
  );
}
