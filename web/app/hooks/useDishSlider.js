"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// How long the old title takes to leave before the new one is swapped in.
// Matches the title-out animation in globals.css.
const OUT_MS = 260;
const IN_MS = 700;

function useReducedMotion() {
  const [isReduced, setIsReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setIsReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isReduced;
}

/**
 * Which category and dish are chosen (`target`, moves at once so the table
 * starts turning) and which dish's words are on screen (`shown`, swaps once
 * the old title has slid out). `phase` drives the CSS: idle -> out -> in.
 */
export default function useDishSlider(categories) {
  const firstCategoryId = categories[0]?.id;
  const [target, setTarget] = useState({ categoryId: firstCategoryId, index: 0 });
  const [shown, setShown] = useState(target);
  const [phase, setPhase] = useState("idle");
  const timers = useRef([]);
  const isReducedMotion = useReducedMotion();

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const goTo = useCallback(
    (categoryId, index) => {
      const next = { categoryId, index };
      setTarget(next);
      timers.current.forEach(clearTimeout);
      if (isReducedMotion) {
        setShown(next);
        setPhase("idle");
        return;
      }
      setPhase("out");
      timers.current = [
        setTimeout(() => {
          setShown(next);
          setPhase("in");
        }, OUT_MS),
        setTimeout(() => setPhase("idle"), OUT_MS + IN_MS),
      ];
    },
    [isReducedMotion]
  );

  const step = useCallback(
    (delta) => {
      const count = (categories.find((c) => c.id === target.categoryId) ?? categories[0]).items.length;
      goTo(target.categoryId, (((target.index + delta) % count) + count) % count);
    },
    [goTo, target, categories]
  );

  return { target, shown, phase, goTo, step, isReducedMotion };
}
