"use client";
import { hoursDisplay } from "../lib/hours";
import { useSettings } from "../hooks/useShop";

/** The owner's opening hours from Admin → Shop, as one line of text. */
export default function OpeningHours() {
  const { hours } = useSettings();
  return hoursDisplay(hours);
}
