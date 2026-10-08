import ClockGate from "./ClockGate";
import ClockTerminal from "./ClockTerminal";

export const metadata = { title: "Staff clock | Flex Chicken", robots: { index: false, follow: false } };

export default function ClockPage() {
  return (
    <ClockGate>
      <ClockTerminal />
    </ClockGate>
  );
}
