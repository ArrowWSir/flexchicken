"use client";
import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
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
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className="px-1 text-[11.5px] font-bold uppercase tracking-[0.18em] text-cream/55">
      {children}
    </h2>
  );
}

// A Service page as a big tile: the number that matters on the shift, then
// one line of context. It turns red when something is waiting on the staff.
function ServiceTile({ section, value, label, detail, isUrgent = false }) {
  const { href, label: title, icon: Icon } = section;
  return (
    <a
      href={href}
      className={`press group flex min-h-[148px] flex-col rounded-3xl p-4 ring-1 ${
        isUrgent ? "bg-flex text-white ring-white/20" : "bg-roast-800 text-cream ring-cream/10 hover:bg-roast-700"
      }`}
    >
      <span className="flex items-center justify-between">
        <span className={`flex size-10 items-center justify-center rounded-2xl ${isUrgent ? "bg-black/20" : "bg-flex text-white"}`}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <ChevronRight className="size-5 opacity-50 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
      <span className="mt-auto pt-4">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="mt-1.5 block font-display text-[34px] font-black leading-none">{value}</span>
        <span className="mt-1 block truncate text-[13px] font-medium opacity-85">{label}</span>
        <span className="block truncate text-[12.5px] opacity-65">{detail}</span>
      </span>
    </a>
  );
}

// A Studio page as one row of a grouped list, like a phone's settings.
function StudioRow({ section, detail }) {
  const { href, label, icon: Icon } = section;
  return (
    <li>
      <a href={href} className="press group flex min-h-[60px] items-center gap-3 px-4 py-2.5 hover:bg-cream/5 active:bg-cream/8">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-flame-light text-roast-950">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{label}</span>
          <span className="block truncate text-[12.5px] text-cream/60">{detail}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-cream/35 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </a>
    </li>
  );
}

/** The admin's front page: shop status, card lookup, then every page with its live numbers. */
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
  const liveOffers = livePromotions(promotions, now).length;
  const team = staff.filter((s) => s.isActive);
  const onShift = team.filter((s) => openShift(shifts, s.id)).length;
  const [service, studio] = MODES;
  const [ordersPage, cardsPage] = service.sections;

  const studioDetail = {
    "/admin/menu": soldOut ? `${plural(items.length, "dish", "dishes")} · ${soldOut} sold out` : `${plural(items.length, "dish", "dishes")}, none sold out`,
    "/admin/offers": liveOffers ? `${plural(liveOffers, "offer")} live now` : "No offers live",
    "/admin/shop": settings.isTakingOrders ? "Taking orders · hours, delivery, prices" : "Orders paused · hours, delivery, prices",
    "/admin/staff": team.length ? `${onShift} of ${plural(team.length, "person", "people")} on shift` : "No staff added yet",
    "/admin/order-list": "What to buy, as a PDF · own PIN",
  };

  return (
    <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-5">
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-cream/60">{new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <a
            href="/admin/shop"
            className={`press flex h-8 shrink-0 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-semibold text-white ${settings.isTakingOrders ? "bg-go" : "bg-flex"}`}
          >
            <span className={`size-2 rounded-full bg-white ${settings.isTakingOrders ? "motion-safe:animate-pulse" : ""}`} aria-hidden="true" />
            {settings.isTakingOrders ? "Taking orders" : "Orders paused"}
          </a>
        </div>
        <h1 className="font-display text-[26px] font-black uppercase leading-none">{greeting(now)}</h1>
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Card code or name" className={`${FIELD} h-12 pl-10 text-[16px]`} />
        </label>
        <button type="submit" className="press h-12 shrink-0 rounded-xl bg-cream px-4 text-[14px] font-semibold text-roast-900">
          Find card
        </button>
      </form>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section aria-labelledby="home-service" className="grid content-start gap-2.5">
          <SectionTitle id="home-service">Service · on the shift</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5">
            <ServiceTile
              section={ordersPage}
              value={waiting}
              label="waiting"
              detail={`${open.length - waiting} in progress`}
              isUrgent={waiting > 0}
            />
            <ServiceTile section={cardsPage} value={stampsToday} label={stampsToday === 1 ? "stamp today" : "stamps today"} detail={`${plural(cards.length, "card")} issued`} />
          </div>
        </section>

        <section aria-labelledby="home-studio" className="grid content-start gap-2.5">
          <SectionTitle id="home-studio">Studio · back office</SectionTitle>
          <ul className="divide-y divide-cream/8 overflow-hidden rounded-3xl bg-roast-900 ring-1 ring-cream/10">
            {studio.sections.map((section) => (
              <StudioRow key={section.href} section={section} detail={studioDetail[section.href]} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
