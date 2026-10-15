import ClockGate from "./ClockGate";
import ClockTerminal from "./ClockTerminal";
import { manifestUrl } from "../lib/apps";

export const metadata = { title: "Staff clock | Flex Chicken", manifest: manifestUrl("clock"), robots: { index: false, follow: false } };

export default function ClockPage() {
  return (
    <ClockGate>
      <ClockTerminal />
    </ClockGate>
  );
}
