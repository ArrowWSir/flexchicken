"use client";
import { useLayoutEffect } from "react";

const MAX_PASSES = 3;

// Shrinks each line until it fits its box. Lines size themselves with
// `calc(<estimate> * var(--fit, 1))`; this sets --fit from the measured width,
// so wide letters (W, M) or a late font swap can never push a word past the
// edge. Re-fits when the text changes, the box resizes or fonts finish loading.
export default function useFitText(refs, text) {
  useLayoutEffect(() => {
    const lines = refs.map((ref) => ref.current).filter(Boolean);
    if (lines.length === 0) return undefined;

    const fit = () => {
      for (const line of lines) {
        // Text width does not scale exactly with font size (tracking and
        // hinting round per size), so correct over a few passes.
        let scale = 1;
        line.style.setProperty("--fit", "1");
        for (let pass = 0; pass < MAX_PASSES; pass++) {
          const available = line.parentElement.clientWidth;
          const needed = line.scrollWidth;
          if (needed <= available) break;
          scale *= (available / needed) * 0.98;
          line.style.setProperty("--fit", scale.toFixed(3));
        }
      }
    };

    fit();
    let isActive = true;
    document.fonts?.ready.then(() => isActive && fit());
    const observer = new ResizeObserver(fit);
    observer.observe(lines[0].parentElement);
    return () => {
      isActive = false;
      observer.disconnect();
    };
    // refs are stable; re-run only when the words change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
}
