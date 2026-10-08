"use client";
import StaffGate from "../components/staff/StaffGate";
import { IS_CLOUD } from "../lib/store";

/**
 * On the live site the clock pad works only on the shop's own tablet: the
 * owner unlocks it once with the owner's code, so PINs cannot be tried (or
 * staff clocked in) from anywhere else. Local builds keep the open pad.
 */
export default function ClockGate({ children }) {
  if (!IS_CLOUD) return children;
  return (
    <StaffGate role="clock" title="Set up the staff clock">
      {() => children}
    </StaffGate>
  );
}
