"use client";
import { formatPriceShort } from "../lib/cart";
import { useSettings } from "../hooks/useShop";

// "£1 within 1 mile · £2 within 2 miles · £15 minimum order", from the live
// shop settings.
export default function DeliveryTerms({ prefix = "" }) {
  const settings = useSettings();
  if (!settings.isDeliveryOn) return <>{prefix}Delivery is paused · collection open</>;
  const zones = settings.deliveryZones.map((zone) => `${formatPriceShort(zone.feePence)} ${zone.label.toLowerCase()}`);
  return (
    <>
      {prefix}Delivery {zones.join(" · ")} · {formatPriceShort(settings.minDeliveryOrderPence)} minimum order
    </>
  );
}
