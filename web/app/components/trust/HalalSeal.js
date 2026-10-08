import { useId } from "react";
import { BRAND } from "../../lib/brand";

const RING_RADIUS = 43;
const RING_LENGTH = Math.round(2 * Math.PI * RING_RADIUS);

/**
 * The shop's own Halal seal: the live site's claim set round a stamp. It is
 * the shop's promise, not a certifier's mark, so it never says "certified".
 * `isQuiet` drops the ring text for small sizes, where it would not read.
 */
export default function HalalSeal({ size = 96, isQuiet = false, className = "" }) {
  const ringId = useId();
  const ring = `${BRAND.halal.claim} · ${BRAND.halal.detail} · `.toUpperCase();
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={`${BRAND.halal.claim}: ${BRAND.halal.detail}`}
      className={`shrink-0 ${className}`}
    >
      <defs>
        <path id={ringId} d={`M60,60 m-${RING_RADIUS},0 a${RING_RADIUS},${RING_RADIUS} 0 1,1 ${RING_RADIUS * 2},0 a${RING_RADIUS},${RING_RADIUS} 0 1,1 -${RING_RADIUS * 2},0`} />
      </defs>
      <circle cx="60" cy="60" r="58" fill="var(--color-roast-800)" />
      <circle cx="60" cy="60" r="54" fill="none" stroke="var(--color-flame-light)" strokeOpacity="0.55" strokeWidth="1" />
      <circle cx="60" cy="60" r="33" fill="none" stroke="var(--color-flame-light)" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="1.5 3" />
      {!isQuiet && (
        <text fill="var(--color-cream)" fontSize="9.4" fontWeight="700" letterSpacing="0.6" style={{ fontFamily: "var(--font-display)" }}>
          <textPath href={`#${ringId}`} textLength={RING_LENGTH} lengthAdjust="spacing">
            {ring}
          </textPath>
        </text>
      )}
      <text x="60" y="55" textAnchor="middle" fill="var(--color-flame-light)" fontSize={isQuiet ? 17 : 13} fontWeight="800" style={{ fontFamily: "var(--font-display)" }}>
        100%
      </text>
      <text x="60" y={isQuiet ? 76 : 72} textAnchor="middle" fill="var(--color-cream)" fontSize={isQuiet ? 20 : 15} fontWeight="900" letterSpacing="0.5" style={{ fontFamily: "var(--font-display)" }}>
        HALAL
      </text>
    </svg>
  );
}
