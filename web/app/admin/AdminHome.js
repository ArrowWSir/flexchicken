"use client";
import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { isFinished } from "../lib/orders";
import { livePromotions } from "../lib/promotions";
import { openShift } from "../lib/timeclock";
import { useCards, useMenu, useOrders, usePromotions, useSettings, useShifts, useStaff } from "../hooks/useShop";
import { useNow } from "../hooks/useDevice";
import { FIELD } from "./ui";
import { MODES } from "./sections";

const CLOCK_MS = 30_000;

function greeting(now) {
  const hour = new Date(now).getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const startOfDay = (now) => new Date(new Date(now).toDateString()).getTime();

function Stat({ value, label, isLoud = false }) {
  return (
    <div className="min-w-0">
      <p className={`font-display font-black leading-none ${isLoud ? "text-[40px]" : "text-[28px]"}`}>{value}</p>
      <p className="mt-1 text-[12px] font-medium opacity-80">{label}</p>
    </div>
  );
}

// A room's door: its numbers, then a button for each page inside.
function Door({ mode, tone, stats }) {
  return (
    <section aria-labelledby={`door-${mode.id}`} className={`relative overflow-hidden rounded-[28px] p-5 sm:p-6 ${tone}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-75">{mode.blurb}</p>
      <h2 id={`door-${mode.id}`} className="mt-1 font-display text-[clamp(34px,9vw,52px)] font-black uppercase leading-[0.9] tracking-[-0.02em]">
        {mode.label}
      </h2>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">{stats}</div>
      <div className="mt-6 flex flex-wrap gap-2">
        {mode.sections.map(({ href, label, icon: Icon }) => (
          <a key={href} href={href} className="press flex h-11 items-center gap-2 rounded-2xl bg-black/20 px-4 text-[14px] font-semibold ring-1 ring-white/15 hover:bg-black/30">
            <Icon className="size-4" aria-hidden="true" />
            {label}
            <ArrowRight className="size-3.5 opacity-70" aria-hidden="true" />
          </a>
        ))}
      </div>
    </section>
  );
}

/** The admin's front page: two rooms and a quick card lookup. */
export default function AdminHome() {
  const now = useNow(CLOCK_MS);
  const orders = useOrders();
  const cards = useCards();
  const { all } = useMenu();
  const promotions = usePromotions();
  const staff = useStaff();
  const shifts = useShifts();
  const settings = useSettings();
  const [query, setQuery] = useState("");

  const open = orders.filter((o) => !isFinished(o));
  const waiting = open.filter((o) => o.status === "placed").length;
  const today = startOfDay(now);
  const stampsToday = cards.reduce((n, c) => n + c.history.filter((h) => h.type === "stamp" && h.at >= today).length, 0);
  const items = all.flatMap((c) => c.items);
  const soldOut = items.filter((i) => i.isSoldOut).length;
  const onShift = staff.filter((s) => s.isActive && openShift(shifts, s.id)).length;
  const [service, studio] = MODES;

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-cream/60">{new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="font-display text-[26px] font-black uppercase leading-none">{greeting(now)}</h1>
        </div>
        <p className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${settings.isTakingOrders ? "bg-go text-white" : "bg-flex text-white"}`}>
          {settings.isTakingOrders ? "Taking orders" : "Orders paused"}
        </p>
      </div>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          window.location.href = `/admin/cards?q=${encodeURIComponent(query.trim())}`;
        }}
        className="flex gap-2"
      >
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Find a loyalty card by its 4-digit code or the customer’s name</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-cream/50" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Card code or name, to stamp" className={`${FIELD} h-12 pl-10 text-[16px]`} />
        </label>
        <button type="submit" className="press h-12 shrink-0 rounded-xl bg-cream px-4 text-[14px] font-semibold text-roast-900">
          Find card
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Door
          mode={service}
          tone="bg-[linear-gradient(150deg,#b81f22,#7d1416)] text-white"
          stats={
            <>
              <Stat value={waiting} label={waiting === 1 ? "order waiting" : "orders waiting"} isLoud />
              <Stat value={open.length - waiting} label="in progress" />
              <Stat value={stampsToday} label="stamps today" />
              <Stat value={cards.length} label="cards issued" />
            </>
          }
        />
        <Door
          mode={studio}
          tone="bg-[linear-gradient(150deg,#fcc282,#f5845c)] text-roast-950"
          stats={
            <>
              <Stat value={items.length} label="dishes on the menu" isLoud />
              <Stat value={soldOut} label="sold out" />
              <Stat value={livePromotions(promotions, now).length} label="offers live" />
              <Stat value={onShift} label="staff on shift" />
            </>
          }
        />
      </div>
    </div>
  );
}
