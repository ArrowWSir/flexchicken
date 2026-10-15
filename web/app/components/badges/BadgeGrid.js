"use client";
import ShinyBadge from "./ShinyBadge";

// Each category has its own close-up (assets-src/make_extras.py: one dish,
// cropped tight so it fills the round badge). A category the owner adds later
// shows its first dish with a photo.
const BADGE_ART = new Set(["burgers", "wraps", "bbq", "ribs", "peri-peri", "burger-meals", "box-meals", "wings-chicken", "boneless", "sides"]);
const badgeImage = (category) =>
  BADGE_ART.has(category.id) ? `/badges/${category.id}.webp` : (category.items.find((item) => item.image)?.image ?? null);

// Badges sweep one after another, so the grid shimmers rather than flashes.
const SWEEP_STAGGER_S = 0.45;

export default function BadgeGrid({ categories, activeId, onSelect }) {
  return (
    <div role="group" aria-label="Menu categories" className="grid grid-cols-5 gap-x-1.5 gap-y-4 sm:gap-x-4">
      {categories.map((category, i) => (
        <ShinyBadge
          key={category.id}
          category={category}
          image={badgeImage(category)}
          isActive={category.id === activeId}
          onSelect={() => onSelect(category.id)}
          sweepDelay={i * SWEEP_STAGGER_S}
        />
      ))}
    </div>
  );
}
