"use client";
import { useRef, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { formatPrice, toPence } from "../../lib/cart";
import { addItem, removeItem, setSoldOut, updateItem } from "../../lib/menuEdits";
import { getRepo } from "../../lib/store";
import { useMenu } from "../../hooks/useShop";
import useDragScroll from "../../hooks/useDragScroll";
import { FIELD } from "../ui";
import ItemEditor from "./ItemEditor";

// One dish: photo, name and price, the on-sale switch, edit and remove.
// `where` names its category when the list mixes categories (search).
function ItemRow({ item, where, onSoldOut, onEdit, onRemove }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-roast-900 p-2.5 ring-1 ring-cream/10">
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-cream/90">
        {item.image ? <img src={item.image} alt="" className="size-full object-contain" /> : <span className="text-[10.5px] font-semibold text-roast-700">No photo</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14.5px] font-semibold ${item.isSoldOut ? "text-cream/50 line-through" : ""}`}>{item.name}</span>
        <span className="block text-[12.5px] text-cream/60">
          {formatPrice(toPence(item.price))}
          {item.options.length ? ` · ${item.options.length} option group${item.options.length === 1 ? "" : "s"}` : ""}
          {where ? ` · ${where}` : ""}
        </span>
      </span>
      <label className="flex shrink-0 cursor-pointer flex-col items-center gap-1 text-[10.5px] font-semibold text-cream/70">
        <input
          type="checkbox"
          role="switch"
          checked={!item.isSoldOut}
          onChange={(e) => onSoldOut(!e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative h-6 w-10 rounded-full bg-flex/70 transition-colors peer-checked:bg-go peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-cream after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
        />
        {item.isSoldOut ? "Sold out" : "On sale"}
        <span className="sr-only"> for {item.name}</span>
      </label>
      <button
        type="button"
        onClick={onEdit}
        className="press flex size-10 shrink-0 items-center justify-center rounded-xl text-cream ring-1 ring-cream/15 hover:bg-cream/10"
        aria-label={`Edit ${item.name}`}
      >
        <Pencil className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="press flex size-10 shrink-0 items-center justify-center rounded-xl text-flame-light ring-1 ring-cream/15 hover:bg-flex/20"
        aria-label={`Remove ${item.name}`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

export default function MenuManager() {
  const { all, edits } = useMenu();
  const [categoryId, setCategoryId] = useState(all[0]?.id);
  const [editing, setEditing] = useState(null); // { item } | { item: null } for new
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [isSoldOutOnly, setIsSoldOutOnly] = useState(false);
  const chipRow = useDragScroll();
  const category = all.find((c) => c.id === categoryId) ?? all[0];
  const everything = all.flatMap((c) => c.items.map((item) => ({ item, where: c.label })));
  const soldOutCount = everything.filter(({ item }) => item.isSoldOut).length;
  const needle = query.trim().toLowerCase();
  const isFiltering = Boolean(needle) || isSoldOutOnly;
  // Searching or "Sold out" looks across every category; otherwise one tab.
  const shown = isFiltering
    ? everything.filter(({ item }) => (!needle || item.name.toLowerCase().includes(needle)) && (!isSoldOutOnly || item.isSoldOut))
    : category.items.map((item) => ({ item, where: null }));
  const pickCategory = (id) => {
    setCategoryId(id);
    setQuery("");
    setIsSoldOutOnly(false);
  };

  // Changes go one at a time, each made on the edits as last saved: two quick
  // taps (sold out on two dishes) both count.
  const queue = useRef(Promise.resolve());
  const commit = (change) => {
    setError(null);
    const run = queue.current.then(async () => {
      try {
        await getRepo().saveMenuEdits(change(getRepo().getMenuEdits()));
        return true;
      } catch (err) {
        setError(err.message);
        return false;
      }
    });
    queue.current = run;
    return run;
  };

  const saveItem = async (draft) => {
    const { image, ...rest } = draft;
    const fields = { ...rest, image };
    const change = (e) => (editing.item ? updateItem(e, editing.item.id, fields) : addItem(e, fields));
    // Rejects on bad input before anything is sent; ItemEditor shows the message.
    change(edits);
    if (await commit(change)) setEditing(null);
  };

  const remove = (item) => {
    if (window.confirm(`Remove "${item.name}" from the menu?`)) commit((e) => removeItem(e, item.id));
  };

  return (
    <div className="grid grid-cols-1 gap-5">
      <h1 className="font-display text-[24px] font-black uppercase leading-none">Menu</h1>

      <section aria-labelledby="items-heading" className="grid grid-cols-1 gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="items-heading" className="font-display text-[18px] font-black uppercase">
            Menu items
          </h2>
          <button
            type="button"
            onClick={() => setEditing({ item: null })}
            className="press flex h-10 items-center gap-1.5 rounded-xl bg-flex px-3.5 text-[13.5px] font-semibold text-white hover:bg-flex-deep"
          >
            <Plus className="size-4" aria-hidden="true" />
            New item
          </button>
        </div>

        {/* Stays under the admin bar while the list scrolls, so search and
            the categories are always one tap away. */}
        <div className="sticky top-[calc(6.25rem+1px+env(safe-area-inset-top))] z-20 -mx-3 grid grid-cols-1 gap-3 bg-roast-950/90 px-3 py-2 backdrop-blur-xl sm:-mx-5 sm:px-5">
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search every dish by name</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-cream/50" aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all dishes" autoComplete="off" className={`${FIELD} pl-10`} />
            </label>
            <button
              type="button"
              aria-pressed={isSoldOutOnly}
              onClick={() => setIsSoldOutOnly((on) => !on)}
              className={`press flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[13.5px] font-semibold ${
                isSoldOutOnly ? "bg-flex text-white" : "ring-1 ring-cream/15 hover:bg-cream/10"
              }`}
            >
              Sold out
              <span className={`rounded-full px-1.5 text-[11.5px] ${isSoldOutOnly ? "bg-black/25" : soldOutCount ? "bg-flex text-white" : "bg-black/20"}`}>{soldOutCount}</span>
            </button>
          </div>

          <div role="tablist" aria-label="Categories" {...chipRow} className="no-scrollbar scroll-row flex cursor-grab gap-1.5 overflow-x-auto pb-1 active:cursor-grabbing">
            {all.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={!isFiltering && c.id === category.id}
                onClick={(e) => {
                  pickCategory(c.id);
                  e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
                }}
                className={`press shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold ${
                  !isFiltering && c.id === category.id ? "bg-cream text-roast-900" : "bg-cream/8 text-cream/75 hover:text-cream"
                }`}
              >
                {c.label} <span className="opacity-60">{c.items.length}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-flex/20 px-4 py-2.5 text-[13px] font-semibold text-flame-light">
            {error}
          </p>
        )}

        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {shown.map(({ item, where }) => (
            <ItemRow
              key={item.id}
              item={item}
              where={where}
              onSoldOut={(isSoldOut) => commit((x) => setSoldOut(x, item.id, isSoldOut))}
              onEdit={() => setEditing({ item })}
              onRemove={() => remove(item)}
            />
          ))}
        </ul>
        {shown.length === 0 && (
          <p className="text-[13px] text-cream/60">
            {query.trim() ? `No dish matches “${query.trim()}”.` : isSoldOutOnly ? "Nothing is sold out." : "No items in this category."}
          </p>
        )}
      </section>

      <ItemEditor
        isOpen={Boolean(editing)}
        item={editing?.item ?? null}
        categoryId={category?.id}
        categories={all}
        onSave={saveItem}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
