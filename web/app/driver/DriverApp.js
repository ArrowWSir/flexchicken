"use client";
import { useMemo, useState } from "react";
import { Bell, BellOff, LogOut, Navigation, Phone, Radio, Sun } from "lucide-react";
import { BRAND } from "../lib/brand";
import { getRepo } from "../lib/store";
import { formatOrderNumber } from "../lib/orders";
import { isOrdersLoaded, useOrders } from "../hooks/useShop";
import { useGeoWatch, useNow, useWakeLock } from "../hooks/useDevice";
import useNewOrderAlert from "../hooks/useNewOrderAlert";
import StaffGate, { signOutStaff } from "../components/staff/StaffGate";
import OrderTicket from "../components/staff/OrderTicket";
import ShopMap from "../components/map/ShopMap";
import { primeSpeech } from "../hooks/useTurnByTurn";
import NavigationView from "./NavigationView";

const TABS = [
  { id: "ready", label: "Ready to take" },
  { id: "mine", label: "My deliveries" },
  { id: "soon", label: "Cooking" },
];

/** Runs an action; true once it is done, false (after saying why) if not. */
async function act(fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    window.alert(err.message);
    return false;
  }
}

/** Asks first, then marks the order delivered. True once it is done. */
async function confirmDelivered(order) {
  if (!window.confirm(`Mark ${formatOrderNumber(order.number)} as delivered?`)) return false;
  return act(() => getRepo().advance(order.id, "delivered"));
}

// What the phone is doing for the customer's map, in plain words.
function SharingBanner({ geo, wake, count }) {
  if (count === 0) {
    return (
      <p className="rounded-2xl bg-cream/5 px-4 py-3 text-[13px] text-cream/70 ring-1 ring-cream/10">
        Take an order and this phone starts sharing your location with the customer. Keep this page open while you drive.
      </p>
    );
  }
  const isLive = geo.status === "live";
  return (
    <div
      role="status"
      className={`grid gap-1.5 rounded-2xl px-4 py-3 text-[13px] ${isLive ? "bg-[#1f4d18] text-white" : "bg-flex text-white"}`}
    >
      <p className="flex items-center gap-2 font-semibold">
        <Radio className={`size-4 ${isLive ? "animate-pulse" : ""}`} aria-hidden="true" />
        {isLive
          ? `Sharing your location with ${count} customer${count === 1 ? "" : "s"} (±${geo.fix.accuracy} m)`
          : geo.error ?? "Starting location…"}
      </p>
      <p className="flex items-center gap-2 text-white/85">
        <Sun className="size-4" aria-hidden="true" />
        {wake === "on"
          ? "Screen will stay on. Keep this page open."
          : "Keep this page open and the screen on, or location stops."}
      </p>
    </div>
  );
}

function ActiveDelivery({ order, fix, now, onNavigate }) {
  return (
    <div className="grid gap-2.5">
      <ShopMap
        height={190}
        label={`Map: you and ${order.customer.name}'s address`}
        center={BRAND.geo}
        markers={[
          { kind: "home", latitude: order.address.latitude, longitude: order.address.longitude },
          ...(fix ? [{ kind: "driver", latitude: fix.latitude, longitude: fix.longitude }] : [{ kind: "shop", ...BRAND.geo }]),
        ]}
      />
      <OrderTicket
        order={order}
        now={now}
        footer={
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onNavigate}
              className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-surface text-[14px] font-bold text-ink hover:bg-line"
            >
              <Navigation className="size-4" aria-hidden="true" />
              Navigate
            </button>
            <a
              href={`tel:${order.customer.phone.replace(/\s/g, "")}`}
              className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-surface text-[14px] font-bold text-ink hover:bg-line"
            >
              <Phone className="size-4" aria-hidden="true" />
              Call
            </a>
            <button
              type="button"
              onClick={() => confirmDelivered(order)}
              className="press col-span-2 h-13 rounded-xl bg-go py-3.5 text-[15px] font-bold text-white hover:bg-go-deep"
            >
              Delivered
            </button>
          </div>
        }
      />
    </div>
  );
}

function DriverScreen({ driver }) {
  const orders = useOrders();
  const now = useNow(1000);
  const [tab, setTab] = useState("ready");
  const [isSoundOn, setIsSoundOn] = useState(false);
  const [navOrderId, setNavOrderId] = useState(null);

  const deliveries = useMemo(() => orders.filter((o) => o.mode === "delivery"), [orders]);
  const lists = {
    ready: deliveries.filter((o) => o.status === "ready").sort((a, b) => a.createdAt - b.createdAt),
    mine: deliveries.filter((o) => o.status === "out_for_delivery" && o.driver?.id === driver.id),
    soon: deliveries.filter((o) => ["placed", "accepted", "preparing"].includes(o.status)).sort((a, b) => a.createdAt - b.createdAt),
  };
  const activeIds = lists.mine.map((o) => o.id).join(",");

  useNewOrderAlert(deliveries, { isSoundOn, status: "ready", label: "Order ready", isLoaded: isOrdersLoaded(orders) });

  // Every fix goes to each order this driver is carrying.
  const geo = useGeoWatch(lists.mine.length > 0, (fix) => {
    // A fix that does not get through is replaced by the next one seconds later.
    activeIds.split(",").filter(Boolean).forEach((id) => getRepo().pushLocation(id, fix).catch(() => {}));
  });
  const wake = useWakeLock(lists.mine.length > 0);

  // Closes by itself once the order is no longer this driver's to carry.
  const navOrder = lists.mine.find((o) => o.id === navOrderId) ?? null;
  const startNavigation = (order) => {
    primeSpeech();
    setNavOrderId(order.id);
  };

  const take = async (order) => {
    if (await act(() => getRepo().advance(order.id, "out_for_delivery", { driver }))) setTab("mine");
  };

  return (
    <div className="on-dark min-h-dvh bg-roast-950 text-cream">
      <header className="sticky top-0 z-30 border-b border-cream/10 bg-roast-950/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[720px] items-center gap-3 px-4">
          <img src="/brand/logo-on-dark.svg" alt="Flex Chicken" width={57} height={32} className="h-8 w-auto shrink-0" />
          <p className="min-w-0 flex-1 leading-tight">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-cream/60">Delivery</span>
            <span className="block truncate text-[14px] font-semibold">{driver.name}</span>
          </p>
          <button
            type="button"
            onClick={() => setIsSoundOn((on) => !on)}
            aria-pressed={isSoundOn}
            aria-label={isSoundOn ? "Sound on for ready orders" : "Sound off for ready orders"}
            className={`press flex size-10 items-center justify-center rounded-xl ${isSoundOn ? "bg-go" : "bg-cream/10"}`}
          >
            {isSoundOn ? <Bell className="size-4" aria-hidden="true" /> : <BellOff className="size-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => {
              if (lists.mine.length && !window.confirm("You still have a delivery. Sign out anyway?")) return;
              signOutStaff("driver");
            }}
            className="press flex size-10 items-center justify-center rounded-xl text-cream/70 hover:bg-cream/10"
            aria-label="Sign out"
          >
            <LogOut className="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[720px] gap-4 px-4 pb-10 pt-4">
        <SharingBanner geo={geo} wake={wake} count={lists.mine.length} />

        <div role="tablist" aria-label="Deliveries" className="grid grid-cols-3 gap-1 rounded-2xl bg-cream/5 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`press flex h-11 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-semibold ${
                tab === t.id ? "bg-cream text-roast-900" : "text-cream/70"
              }`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 text-[11px] ${t.id === "ready" && lists.ready.length ? "bg-flex text-white" : "bg-black/20"}`}>
                {lists[t.id].length}
              </span>
            </button>
          ))}
        </div>

        {lists[tab].length === 0 && (
          <p className="rounded-2xl border border-dashed border-cream/15 px-4 py-8 text-center text-[13.5px] text-cream/50">
            {tab === "ready" ? "No orders waiting. The kitchen marks them ready." : tab === "mine" ? "You are not carrying any orders." : "Nothing cooking for delivery."}
          </p>
        )}

        {tab === "ready" &&
          lists.ready.map((order) => (
            <OrderTicket key={order.id} order={order} now={now} actions={[{ label: "Take this order", tone: "go", onClick: () => take(order) }]} />
          ))}
        {tab === "mine" &&
          lists.mine.map((order) => (
            <ActiveDelivery key={order.id} order={order} fix={geo.fix} now={now} onNavigate={() => startNavigation(order)} />
          ))}
        {tab === "soon" && lists.soon.map((order) => <OrderTicket key={order.id} order={order} now={now} />)}
      </main>

      {navOrder && (
        <NavigationView
          order={navOrder}
          geo={geo}
          onClose={() => setNavOrderId(null)}
          onDelivered={async () => (await confirmDelivered(navOrder)) && setNavOrderId(null)}
        />
      )}
    </div>
  );
}

export default function DriverApp() {
  return (
    <StaffGate role="driver" title="Delivery">
      {(driver) => <DriverScreen driver={driver} />}
    </StaffGate>
  );
}
