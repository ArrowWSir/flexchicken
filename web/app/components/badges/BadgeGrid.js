"use client";
import ShinyBadge from "./ShinyBadge";

// A badge shows the first dish in its category that has a photo.
const badgeImage = (category) => category.items.find((item) => item.image)?.image ?? null;

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
