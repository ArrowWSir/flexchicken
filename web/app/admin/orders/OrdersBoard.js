"use client";
import { useMemo, useState } from "react";
import { Bell, BellOff, Printer } from "lucide-react";
import { getRepo } from "../../lib/store";
import { formatOrderNumber } from "../../lib/orders";
import { printReceipt } from "../../lib/printer";
import { isOrdersLoaded, useOrders } from "../../hooks/useShop";
import { useIsNetworkPrinter } from "../../hooks/usePrinter";
import { useNow } from "../../hooks/useDevice";
import useNewOrderAlert from "../../hooks/useNewOrderAlert";
import OrderTicket from "../../components/staff/OrderTicket";
import PrinterStatus from "../../components/staff/PrinterStatus";

const LANES = [
  { id: "new", label: "New", statuses: ["placed"] },
  { id: "kitchen", label: "Kitchen", statuses: ["accepted", "preparing"] },
  { id: "ready", label: "Ready", statuses: ["ready"] },
  { id: "out", label: "On the way", statuses: ["out_for_delivery"] },
  { id: "done", label: "Done", statuses: ["delivered", "collected", "cancelled"] },
];
const DONE_SHOWN = 20;

// Statuses where the receipt is already out and staff may need another copy.
const REPRINTABLE = new Set(["accepted", "preparing", "ready", "out_for_delivery"]);

const laneOf = (status) => LANES.find((l) => l.statuses.includes(status))?.id ?? "new";

// The order's one-time stamp link; a reprint gets the same one. If the code
// cannot be saved the receipt still prints, just without the QR.
async function stampUrlFor(order) {
  try {
    const token = await getRepo().issueStampToken(order.id);
    return `${window.location.origin}/stamp?t=${token}`;
  } catch {
    return null;
  }
}

// The order is accepted either way; a printer problem only needs a reprint.
async function printOrWarn(order) {
  printReceipt(order, { stampUrl: await stampUrlFor(order) }).catch(() => {
    window.alert(`Order ${formatOrderNumber(order.number)} is accepted, but its receipt did not print. Check the till printer, then tap Reprint receipt.`);
  });
}

// The network printer's copy goes in its queue on the server.
const queueReprint = (order) => getRepo().printReceipt(order.id).catch((err) => window.alert(err.message));

function reprintButton(order, isNetworkPrinter) {
  if (!REPRINTABLE.has(order.status)) return null;
  return (
    <button
      type="button"
      onClick={() => (isNetworkPrinter ? queueReprint(order) : printOrWarn(order))}
      className="press mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold text-muted ring-1 ring-line hover:bg-surface"
    >
      <Printer className="size-4" aria-hidden="true" />
      Reprint receipt
    </button>
  );
}

// The next action for each step, as one big button: a bump bar on glass.
// `onMoved` lets a phone follow the ticket into its next lane.
function actionsFor(order, onMoved, isNetworkPrinter) {
  const act = async (status) => {
    try {
      const updated = await getRepo().advance(order.id, status);
      onMoved(laneOf(status));
      // Accepting sends the ticket to the kitchen on paper: from the till's
      // screen, or, with the network printer, the server has queued it already.
      if (status === "accepted" && !isNetworkPrinter) printOrWarn(updated);
    } catch (err) {
      window.alert(err.message);
    }
  };
  const cancel = () => {
    if (window.confirm(`Cancel order #${order.number}? The customer will see it as cancelled.`)) act("cancelled");
  };
  const go = (label, status) => ({ label, tone: "go", onClick: () => act(status) });
  const stop = { label: "Cancel", tone: "danger", onClick: cancel };
  switch (order.status) {
    case "placed":
      return [go("Accept", "accepted"), { ...stop, label: "Reject" }];
    case "accepted":
      return [go("Start cooking", "preparing"), stop];
    case "preparing":
      return [go("Mark ready", "ready"), stop];
    case "ready":
      // Drivers take ready orders in /driver; "Sent out" covers a driver
      // without the app (no live map for the customer then).
      return order.mode === "collection"
        ? [go("Collected", "collected"), stop]
        : [{ label: "Sent out", tone: "quiet", onClick: () => act("out_for_delivery") }, stop];
    case "out_for_delivery":
      // In case the driver forgets to tap Delivered.
      return [{ label: "Mark delivered", tone: "quiet", onClick: () => act("delivered") }];
    default:
      return [];
  }
}

export default function OrdersBoard() {
  const orders = useOrders();
  const now = useNow(1000);
  const [isSoundOn, setIsSoundOn] = useState(false);
  const [lane, setLane] = useState("new");
  const isNetworkPrinter = useIsNetworkPrinter();
  useNewOrderAlert(orders, { isSoundOn, label: "New order", isLoaded: isOrdersLoaded(orders) });

  const byLane = useMemo(() => {
    const sorted = [...orders].sort((a, b) => a.createdAt - b.createdAt);
    return Object.fromEntries(
      LANES.map((l) => {
        const list = sorted.filter((o) => l.statuses.includes(o.status));
        return [l.id, l.id === "done" ? list.reverse().slice(0, DONE_SHOWN) : list];
      })
    );
  }, [orders]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-black uppercase leading-none">Orders</h1>
        </div>
        <button
          type="button"
          onClick={() => setIsSoundOn((on) => !on)}
          aria-pressed={isSoundOn}
          className={`press flex h-11 items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold ${
            isSoundOn ? "bg-go text-white" : "bg-flex text-white"
          }`}
        >
          {isSoundOn ? <Bell className="size-4" aria-hidden="true" /> : <BellOff className="size-4" aria-hidden="true" />}
          {isSoundOn ? "Sound on" : "Tap to turn sound on"}
        </button>
      </div>

      {isNetworkPrinter && <PrinterStatus now={now} />}

      {/* Phones: one lane at a time. */}
      <div role="tablist" aria-label="Order lanes" className="no-scrollbar scroll-row mb-4 flex gap-1.5 overflow-x-auto lg:hidden">
        {LANES.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={lane === l.id}
            onClick={() => setLane(l.id)}
            className={`press flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold ${
              lane === l.id ? "bg-cream text-roast-900" : "bg-cream/8 text-cream/75"
            }`}
          >
            {l.label}
            <span className={`rounded-full px-1.5 text-[11.5px] ${l.id === "new" && byLane.new.length ? "bg-flex text-white" : "bg-black/20"}`}>
              {byLane[l.id].length}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {LANES.map((l) => (
          <section key={l.id} aria-label={l.label} className={`${lane === l.id ? "block" : "hidden"} lg:block`}>
            <h2 className="mb-2.5 hidden items-center justify-between text-[12px] font-bold uppercase tracking-[0.14em] text-cream/70 lg:flex">
              {l.label}
              <span className={`rounded-full px-2 py-0.5 ${l.id === "new" && byLane.new.length ? "bg-flex text-white" : "bg-cream/10"}`}>
                {byLane[l.id].length}
              </span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {byLane[l.id].length === 0 ? (
                <p className="rounded-2xl border border-dashed border-cream/15 px-4 py-6 text-center text-[13px] text-cream/50">
                  {l.id === "new" ? "No new orders" : "Nothing here"}
                </p>
              ) : (
                byLane[l.id].map((order) => <OrderTicket key={order.id} order={order} now={now} actions={actionsFor(order, setLane, isNetworkPrinter)} footer={reprintButton(order, isNetworkPrinter)} />)
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
