"use client";
import { useState } from "react";
import { CheckCircle2, CircleAlert, LocateFixed, MapPinOff, Search } from "lucide-react";
import { BRAND } from "../lib/brand";
import { formatPriceShort } from "../lib/cart";
import { distanceMiles } from "../lib/geo";
import { lookupPostcode, postcodeAt } from "../lib/postcode";
import ShopMap from "../components/map/ShopMap";

const SHOP = BRAND.geo;
// Guide circles on the map; the zones themselves are by postcode.
const ZONE_RINGS = [1, 2];

const TONES = {
  ok: "bg-[#e8f3e4] text-[#1f4d18]",
  short: "bg-[#fff1d6] text-[#6b4300]",
  out: "bg-[#fde8e6] text-[#8a1517]",
};

// Green: we deliver here (with the zone and its fee). Amber: we deliver here,
// but the basket is under the minimum. Red: outside every zone.
function ZoneBanner({ place, quote, onSwitchToCollection }) {
  const tone = quote.isAvailable ? "ok" : quote.isInArea ? "short" : "out";
  const Icon = tone === "ok" ? CheckCircle2 : tone === "short" ? CircleAlert : MapPinOff;
  return (
    <div role="status" className={`flex items-start gap-3 rounded-2xl px-4 py-3.5 text-[13.5px] leading-snug ${TONES[tone]}`}>
      <Icon className="mt-0.5 size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <div>
        {tone === "ok" && (
          <p>
            <strong className="font-semibold">We deliver to {place.postcode}.</strong> {quote.zone.label}: {formatPriceShort(quote.feePence)} delivery.
          </p>
        )}
        {tone === "short" && (
          <>
            <p>
              <strong className="font-semibold">We deliver to {place.postcode}</strong> ({quote.zone.label.toLowerCase()}). {quote.reason}
            </p>
            <p className="mt-2 flex gap-4 font-semibold">
              <a href="/#menu" className="underline underline-offset-2">
                Add more
              </a>
              <button type="button" onClick={onSwitchToCollection} className="underline underline-offset-2">
                Collect instead
              </button>
            </p>
          </>
        )}
        {tone === "out" && (
          <>
            <p>
              <strong className="font-semibold">Outside our delivery area.</strong> {quote.reason}
            </p>
            <button type="button" onClick={onSwitchToCollection} className="mt-2 font-semibold underline underline-offset-2">
              Switch to collection
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Finds where the customer is (postcode or GPS) and shows it against the
 * delivery circle. Reports { postcode, latitude, longitude, miles } upward.
 */
export default function DeliveryCheck({ place, onPlace, quote, onSwitchToCollection }) {
  const [postcode, setPostcode] = useState(place?.postcode ?? "");
  const [status, setStatus] = useState({ busy: false, error: null });

  const settle = (point) => {
    onPlace({ ...point, miles: Math.round(distanceMiles(SHOP, point) * 10) / 10 });
    setStatus({ busy: false, error: null });
  };

  const check = async (event) => {
    event.preventDefault();
    setStatus({ busy: true, error: null });
    try {
      settle(await lookupPostcode(postcode));
    } catch (err) {
      setStatus({ busy: false, error: err.message });
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setStatus({ busy: false, error: "This device cannot share its location. Enter your postcode instead." });
      return;
    }
    setStatus({ busy: true, error: null });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        try {
          // Zones are by postcode, so the location has to become one; the fee
          // then follows that postcode's position, as the shop's server does.
          const found = await postcodeAt(point);
          setPostcode(found);
          settle(await lookupPostcode(found));
        } catch (err) {
          setStatus({ busy: false, error: err.message });
        }
      },
      () => setStatus({ busy: false, error: "We could not get your location. Enter your postcode instead." }),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const isInside = !place || quote.isInArea;

  return (
    <div className="grid gap-3">
      <form onSubmit={check} className="flex gap-2">
        <label className="sr-only" htmlFor="postcode">
          Postcode
        </label>
        <input
          id="postcode"
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          placeholder="Postcode, e.g. RM13 9AA"
          autoComplete="postal-code"
          className="h-12 min-w-0 flex-1 rounded-2xl bg-ground-raised px-4 text-[15px] uppercase ring-1 ring-field placeholder:normal-case placeholder:text-muted/80 focus:outline-none focus:ring-2 focus:ring-flex-ink"
        />
        <button
          type="submit"
          disabled={status.busy}
          className="press on-dark flex h-12 items-center gap-1.5 rounded-2xl bg-roast-800 px-4 text-[14px] font-semibold text-cream disabled:opacity-60"
        >
          <Search className="size-4" strokeWidth={2.2} aria-hidden="true" />
          Check
        </button>
      </form>
      <button
        type="button"
        onClick={useMyLocation}
        disabled={status.busy}
        className="press flex items-center justify-center gap-2 rounded-2xl py-2.5 text-[13.5px] font-semibold text-flex-ink ring-1 ring-line hover:bg-surface"
      >
        <LocateFixed className="size-4" strokeWidth={2.2} aria-hidden="true" />
        Use my location
      </button>

      {status.error && (
        <p role="alert" className="text-[13px] font-medium text-flex-ink">
          {status.error}
        </p>
      )}

      {place && <ZoneBanner place={place} quote={quote} onSwitchToCollection={onSwitchToCollection} />}

      <ShopMap
        height={200}
        label={
          place
            ? `Map: the shop, your location ${place.miles} miles away, and the delivery zones`
            : "Map: the shop and its delivery zones, about 1 and 2 miles around it"
        }
        center={SHOP}
        rings={ZONE_RINGS}
        isInside={isInside}
        markers={[{ kind: "shop", ...SHOP }, ...(place ? [{ kind: "home", latitude: place.latitude, longitude: place.longitude }] : [])]}
      />
    </div>
  );
}
