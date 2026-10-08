"use client";
import { useEffect, useState } from "react";
import { Gift, Pencil, Plus, Search, Undo2 } from "lucide-react";
import { STAMPS_PER_CARD } from "../../lib/card";
import { findCards } from "../../lib/loyalty";
import { getRepo } from "../../lib/store";
import { useCards } from "../../hooks/useShop";
import { useNow } from "../../hooks/useDevice";
import { FIELD } from "../ui";

const SHOWN = 40;
const CLOCK_MS = 60_000;
const NOTE_MS = 4000;
const STAMPED_BY = "counter";
const HISTORY_LABEL = { stamp: "Stamp", unstamp: "Stamp taken back", reward: "Surprise given" };

export function ago(at, now) {
  if (!at) return null;
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function StampMeter({ stamps }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {Array.from({ length: STAMPS_PER_CARD }, (_, i) => (
        <span key={i} className={`size-3.5 rounded-full ${i < stamps ? "bg-flame-light" : "ring-1 ring-inset ring-cream/25"}`} />
      ))}
    </span>
  );
}

function CardRow({ card, now, act }) {
  const isFull = card.stamps >= STAMPS_PER_CARD;
  const who = card.name || "No name yet";
  const rename = () => {
    const name = window.prompt(`Name for card ${card.code}`, card.name);
    if (name !== null) act(() => getRepo().renameCard(card.id, name), `Card ${card.code} renamed.`);
  };
  return (
    <li className="rounded-2xl bg-roast-900 p-3.5 ring-1 ring-cream/10">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="font-display text-[30px] font-black tabular-nums leading-none tracking-[0.08em] text-flame-light">{card.code}</p>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
            <span className={card.name ? "" : "text-cream/55"}>{who}</span>
            <button type="button" onClick={rename} className="press rounded-md p-1 text-cream/60 hover:text-cream" aria-label={`Rename card ${card.code}`}>
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
          </p>
          {card.email && <p className="truncate text-[12.5px] text-cream/60">{card.email}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-cream/65">
            <StampMeter stamps={card.stamps} />
            <span>
              {card.stamps}/{STAMPS_PER_CARD}
              {card.rewards > 0 && ` · ${card.rewards} surprise${card.rewards === 1 ? "" : "s"} given`}
              {` · ${card.lastStampAt ? `last stamp ${ago(card.lastStampAt, now)}` : "no stamps yet"}`}
            </span>
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {isFull ? (
            <button
              type="button"
              onClick={() => act(() => getRepo().redeemCard(card.id, STAMPED_BY), `Surprise given on ${card.code}. The card starts again.`)}
              className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-flame-light px-4 text-[15px] font-bold text-roast-950 sm:flex-none"
            >
              <Gift className="size-5" aria-hidden="true" />
              Give surprise
            </button>
          ) : (
            <button
              type="button"
              onClick={() => act(() => getRepo().stampCard(card.id, STAMPED_BY), `Stamp added to ${card.code}: ${card.stamps + 1} of ${STAMPS_PER_CARD}.`)}
              className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-go px-5 text-[15px] font-bold text-white hover:bg-go-deep sm:flex-none"
              aria-label={`Add a stamp to card ${card.code}`}
            >
              <Plus className="size-5" strokeWidth={2.6} aria-hidden="true" />
              Stamp
            </button>
          )}
          <button
            type="button"
            disabled={card.stamps === 0}
            onClick={() =>
              window.confirm(`Take one stamp back from card ${card.code}?`) &&
              act(() => getRepo().unstampCard(card.id, STAMPED_BY), `One stamp taken back from ${card.code}.`)
            }
            className="press flex h-12 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold text-flame-light ring-1 ring-flex/60 hover:bg-flex/20 disabled:opacity-30"
            aria-label={`Take a stamp back from card ${card.code}`}
          >
            <Undo2 className="size-4" aria-hidden="true" />
            Undo
          </button>
        </div>
      </div>
      {card.history.length > 0 && (
        <details className="mt-2.5 text-[12.5px] text-cream/70">
          <summary className="cursor-pointer select-none font-semibold text-cream/80">History</summary>
          <ol className="mt-1.5 grid gap-0.5">
            {[...card.history].reverse().map((h, i) => (
              <li key={`${h.at}-${i}`}>
                {HISTORY_LABEL[h.type] ?? h.type} · {new Date(h.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
              </li>
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}

/**
 * The counter's card desk: find a customer by the 4-digit code on their card
 * (or their name), then stamp it, take a stamp back or give the surprise.
 */
export default function CardsDesk() {
  const cards = useCards();
  const now = useNow(CLOCK_MS);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState(null); // { tone: "ok" | "error", text }

  // Arriving from the admin home's search box.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
  }, []);

  useEffect(() => {
    if (!note) return undefined;
    const timer = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(timer);
  }, [note]);

  const act = async (fn, text) => {
    try {
      await fn();
      setNote({ tone: "ok", text });
    } catch (err) {
      setNote({ tone: "error", text: err.message });
    }
  };

  const found = findCards(cards, query);
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[24px] font-black uppercase leading-none">Loyalty cards</h1>
        <p className="text-[13px] text-cream/60">
          {cards.length} card{cards.length === 1 ? "" : "s"} · {STAMPS_PER_CARD} stamps, then a surprise
        </p>
      </div>

      <label className="relative">
        <span className="sr-only">Search by 4-digit card code, name or email</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-cream/50" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Card code (e.g. 4271), name or email"
          autoComplete="off"
          className={`${FIELD} h-14 pl-12 text-[18px]`}
        />
      </label>

      <p role="status" aria-live="polite" className={`min-h-5 text-[13.5px] font-semibold ${note?.tone === "error" ? "text-flame-light" : "text-[#8fdc7f]"}`}>
        {note?.text}
      </p>

      {found.length > 0 ? (
        <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          {found.slice(0, SHOWN).map((card) => (
            <CardRow key={card.id} card={card} now={now} act={act} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-roast-900 p-5 text-[14px] text-cream/70 ring-1 ring-cream/10">
          {cards.length === 0
            ? "No cards yet. Every customer who opens the website gets one, with a 4-digit code on it."
            : `No card matches “${query}”. Ask the customer to read the 4 digits on their card.`}
        </p>
      )}
      {found.length > SHOWN && <p className="text-[12.5px] text-cream/60">Showing the {SHOWN} most recent. Search to narrow it down.</p>}
    </div>
  );
}
