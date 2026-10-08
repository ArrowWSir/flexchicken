"use client";
import { Bell, BellOff, BellRing } from "lucide-react";
import { useOrders } from "../hooks/useShop";
import useOrderNotifications from "../hooks/useOrderNotifications";

const HELP = {
  denied: "Notifications are blocked for this site. Allow them in the browser's site settings, then tap the bell again.",
  unsupported: "This browser can't show notifications. On an iPhone or iPad, add the admin to the Home Screen and open it from there.",
};

/** The bell in the admin bar: new-order notifications on any admin page. */
export default function OrderAlerts() {
  const orders = useOrders();
  const { status, isOn, turnOn, turnOff } = useOrderNotifications(orders);

  const onClick = () => {
    if (HELP[status]) return window.alert(HELP[status]);
    return isOn ? turnOff() : turnOn();
  };
  const Icon = isOn ? BellRing : status === "denied" || status === "unsupported" ? BellOff : Bell;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isOn}
      aria-label={isOn ? "New-order notifications on. Tap to turn off" : "Turn on new-order notifications"}
      title={isOn ? "Notifications on" : "Notify me of new orders"}
      className={`press relative flex size-9 shrink-0 min-[400px]:size-10 items-center justify-center rounded-xl ${
        isOn ? "bg-go text-white" : "text-cream/70 hover:bg-cream/10 hover:text-cream"
      }`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {!isOn && status === "default" && <span className="absolute right-2 top-2 size-2 rounded-full bg-flex" aria-hidden="true" />}
    </button>
  );
}
