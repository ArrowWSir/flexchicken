"use client";
import { BRAND } from "../../lib/brand";
import { driverFix } from "../../lib/tracking";
import { useNow } from "../../hooks/useDevice";
import { useDriverLocation } from "../../hooks/useShop";
import ShopMap from "./ShopMap";

// Re-check every so often so a driver who stops sharing stops looking live.
const STALE_CHECK_MS = 15_000;

/**
 * The delivery map for one order: the shop and the address, plus the driver
 * live once the order is on the way. Renders nothing for collection orders.
 * @param {{ order: object, height?: number, headingLevel?: 2 | 3, showAddress?: boolean }} props
 */
export default function DriverMap({ order, height = 240, headingLevel = 2, showAddress = true }) {
  const isOnTheWay = order.status === "out_for_delivery";
  const location = useDriverLocation(isOnTheWay ? order.id : null);
  const now = useNow(STALE_CHECK_MS);
  const home = order.address;
  if (order.mode !== "delivery" || !home) return null;

  const { isLive, milesAway, minutesAway } = driverFix(order, location, Math.max(now, location?.at ?? 0));
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const headingId = `map-heading-${order.id}`;

  return (
    <section className="grid gap-2" aria-labelledby={headingId}>
      <Heading id={headingId} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 font-display text-[15px] font-extrabold uppercase tracking-[0.04em]">
        <span className="whitespace-nowrap">{isOnTheWay ? "Your driver" : "Delivery to"}</span>
        {isLive && (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold normal-case tracking-normal text-[#24561c]">
            <span className="size-2 animate-pulse rounded-full bg-go" aria-hidden="true" />
            Live · about {minutesAway} min away
          </span>
        )}
      </Heading>
      <ShopMap
        height={height}
        label={isLive ? `Map: your driver is ${milesAway.toFixed(1)} miles away` : "Map: the shop and your address"}
        center={BRAND.geo}
        markers={[
          { kind: "shop", ...BRAND.geo },
          { kind: "home", latitude: home.latitude, longitude: home.longitude },
          ...(isOnTheWay && location ? [{ kind: "driver", latitude: location.latitude, longitude: location.longitude }] : []),
        ]}
      />
      {isOnTheWay && !isLive && <p className="text-[12.5px] text-muted">Waiting for the driver&rsquo;s location…</p>}
      {showAddress && (
        <p className="text-[13px] text-muted">
          {home.line1}
          {home.line2 ? `, ${home.line2}` : ""}, {home.postcode}
        </p>
      )}
    </section>
  );
}
