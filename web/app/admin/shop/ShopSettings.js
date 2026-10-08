"use client";
import { Clock, MapPin, Power } from "lucide-react";
import { getRepo } from "../../lib/store";
import { openStatus } from "../../lib/hours";
import { useSettings } from "../../hooks/useShop";
import { useNow } from "../../hooks/useDevice";
import { NumberSetting, Toggle } from "../ui";
import DeliveryZones from "./DeliveryZones";
import OpeningHoursEditor from "./OpeningHoursEditor";

const CLOCK_MS = 60_000;
const SECTIONS = [
  { id: "now", label: "Right now", icon: Power },
  { id: "hours", label: "Opening hours", icon: Clock },
  { id: "zones", label: "Delivery zones", icon: MapPin },
];

function Panel({ id, title, hint, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-32 rounded-[22px] bg-roast-900 p-4 ring-1 ring-cream/10 sm:p-5">
      <h2 id={`${id}-heading`} className="font-display text-[18px] font-black uppercase">
        {title}
      </h2>
      {hint && <p className="mt-1 max-w-[70ch] text-[12.5px] text-cream/60">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// What a customer sees on the website at this moment, in one line.
function LiveStatus({ settings, now }) {
  const hours = openStatus(new Date(now), settings.hours);
  const isOrdering = settings.isTakingOrders && hours.isOpen;
  const text = !settings.isTakingOrders
    ? "Ordering is paused, so the website takes no orders."
    : hours.isOpen
      ? `Customers can order now (${hours.label.replace("Open now · ", "")}). ${settings.isDeliveryOn ? "Delivery and collection." : "Collection only."}`
      : `Closed on the website: ${hours.label.replace("Closed · ", "")}.`;
  return (
    <p role="status" className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-[13.5px] font-semibold ${isOrdering ? "bg-go/25 text-[#cdf3c4]" : "bg-flex/25 text-flame-light"}`}>
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${isOrdering ? "bg-[#8fdc7f]" : "bg-flame-light"}`} aria-hidden="true" />
      {text}
    </p>
  );
}

export default function ShopSettings() {
  const settings = useSettings();
  const now = useNow(CLOCK_MS);
  const save = (patch) => getRepo().saveSettings(patch);
  // Switches and number fields have no message line of their own.
  const saveOrAlert = (patch) => save(patch).catch((err) => window.alert(err.message));
  return (
    <div className="grid grid-cols-1 gap-4">
      <nav aria-label="Shop settings sections" className="no-scrollbar -mt-1 flex gap-1.5 overflow-x-auto">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#${id}`} className="press flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-cream/80 ring-1 ring-cream/15 hover:bg-cream/10 hover:text-cream">
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </a>
        ))}
      </nav>

      <Panel id="now" title="Right now">
        <LiveStatus settings={settings} now={now} />
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <Toggle
            label="Taking orders"
            hint={settings.isTakingOrders ? "On: orders follow the opening hours" : "Paused: no orders, whatever the hours"}
            checked={settings.isTakingOrders}
            onChange={(v) => saveOrAlert({ isTakingOrders: v })}
          />
          <Toggle
            label="Delivery"
            hint={settings.isDeliveryOn ? "Delivery and collection" : "Collection only"}
            checked={settings.isDeliveryOn}
            onChange={(v) => saveOrAlert({ isDeliveryOn: v })}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberSetting label="Delivery minimum order" isMoney step={0.5} value={settings.minDeliveryOrderPence} onCommit={(v) => saveOrAlert({ minDeliveryOrderPence: v })} />
          <NumberSetting label="Ready in" suffix="min" value={settings.prepMinutes} onCommit={(v) => saveOrAlert({ prepMinutes: v })} />
        </div>
      </Panel>

      <Panel id="hours" title="Opening hours" hint="London time. Outside these hours the website shows “Closed” and checkout takes no orders. For a holiday, switch the day to Closed.">
        <OpeningHoursEditor hours={settings.hours} onSave={(hours) => save({ hours })} />
      </Panel>

      <Panel id="zones" title="Delivery zones">
        <DeliveryZones zones={settings.deliveryZones} onSave={(deliveryZones) => save({ deliveryZones })} />
      </Panel>
    </div>
  );
}
