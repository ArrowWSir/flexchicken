"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toPence } from "../../lib/cart";
import { MAX_RADIUS_MILES, parseAreas, readRadius } from "../../lib/deliveryZones";

const field =
  "w-full rounded-xl bg-cream/8 px-3.5 text-[15px] text-cream ring-1 ring-cream/45 focus:outline-none focus:ring-2 focus:ring-flame-light";

const toDraft = (zones) =>
  zones.map((z) => ({
    id: z.id,
    label: z.label,
    fee: (z.feePence / 100).toFixed(2),
    radius: z.radiusMiles == null ? "" : String(z.radiusMiles),
    text: z.areas.join("\n"),
  }));

/** Checks every draft; returns the zones to save, or throws with what to fix. */
function fromDraft(drafts) {
  return drafts.map((draft, i) => {
    const name = draft.label.trim() || `Zone ${i + 1}`;
    const fee = Number(draft.fee);
    if (draft.fee.trim() === "" || !Number.isFinite(fee) || fee < 0) throw new Error(`${name}: enter a delivery fee, like 1.00.`);
    const { areas, invalid } = parseAreas(draft.text);
    if (invalid.length) throw new Error(`${name}: these are not postcodes: ${invalid.join(", ")}.`);
    if (!areas.length) throw new Error(`${name}: add at least one postcode or area.`);
    const radiusMiles = readRadius(draft.radius.trim());
    if (draft.radius.trim() !== "" && radiusMiles === null) throw new Error(`${name}: the distance must be between 0 and ${MAX_RADIUS_MILES} miles, or left empty.`);
    return { id: draft.id, label: name.slice(0, 40), feePence: toPence(fee), radiusMiles, areas };
  });
}

/**
 * The owner's delivery zones: a name, a fee and the postcodes each covers.
 * Postcodes are one per line: a full postcode (RM13 9AA), a sector (RM12 5)
 * or a whole district (RM12). Zones are checked top to bottom.
 */
export default function DeliveryZones({ zones, onSave }) {
  const [drafts, setDrafts] = useState(() => toDraft(zones));
  const [saved, setSaved] = useState(zones);
  const [message, setMessage] = useState(null); // { tone: "ok" | "error", text }
  // Another screen saved different zones: show them. (Compared by value: the
  // settings object is rebuilt on every read.)
  if (JSON.stringify(zones) !== JSON.stringify(saved)) {
    setSaved(zones);
    setDrafts(toDraft(zones));
  }

  const change = (i, patch) => {
    setDrafts((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)));
    setMessage(null);
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      await onSave(fromDraft(drafts));
      setMessage({ tone: "ok", text: "Delivery zones saved." });
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    }
  };

  return (
    <form onSubmit={save} aria-labelledby="zones-heading" className="grid gap-3">
      <div>
        <p className="text-[12.5px] text-cream/60">
          One per line: a full postcode (RM13 9AA), a sector (RM12 5) or a district (RM12). A postcode on no list still gets the
          nearest zone whose distance reaches it, measured in a straight line from the shop, but only in districts already on a list
          (so never across the river). Anywhere else is collection only. A listed postcode, sector or district is delivered
          whatever its distance, so list only places inside the zone&apos;s distance.
        </p>
      </div>

      <ol className="grid gap-3 lg:grid-cols-2">
        {drafts.map((draft, i) => (
          <li key={draft.id} className="grid gap-2.5 rounded-2xl bg-cream/5 p-3.5 ring-1 ring-cream/10">
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-end gap-2">
              <label className="grid min-w-0 gap-1.5 text-[13px] font-semibold">
                Zone name
                <input value={draft.label} onChange={(e) => change(i, { label: e.target.value })} maxLength={40} className={`${field} h-11 min-w-0`} />
              </label>
              <label className="grid min-w-0 gap-1.5 text-[13px] font-semibold">
                Fee
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="text-cream/60">£</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={draft.fee}
                    onChange={(e) => change(i, { fee: e.target.value })}
                    className={`${field} h-11 min-w-0`}
                  />
                </span>
              </label>
              <button
                type="button"
                onClick={() => setDrafts((list) => list.filter((_, j) => j !== i))}
                disabled={drafts.length === 1}
                aria-label={`Remove ${draft.label || `zone ${i + 1}`}`}
                className="press flex size-11 items-center justify-center rounded-xl text-cream/70 hover:bg-flex/25 hover:text-cream disabled:opacity-30"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
            <label className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
              Also unlisted postcodes within
              <input
                type="number"
                min="0"
                max={MAX_RADIUS_MILES}
                step="0.1"
                inputMode="decimal"
                value={draft.radius}
                onChange={(e) => change(i, { radius: e.target.value })}
                placeholder="off"
                className={`${field} h-10 w-20 min-w-0`}
              />
              miles
            </label>
            <label className="grid gap-1.5 text-[13px] font-semibold">
              <span>
                Postcodes <span className="font-normal text-cream/60">· {parseAreas(draft.text).areas.length}</span>
              </span>
              <textarea
                value={draft.text}
                onChange={(e) => change(i, { text: e.target.value })}
                rows={6}
                spellCheck={false}
                className={`${field} py-2.5 font-mono text-[13.5px] uppercase leading-relaxed`}
              />
            </label>
          </li>
        ))}
      </ol>

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-[13px] font-semibold ${message.tone === "error" ? "text-flame-light" : "text-[#8fdc7f]"}`}>
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="press h-11 rounded-xl bg-cream px-4 text-[14px] font-semibold text-roast-900">
          Save delivery zones
        </button>
        <button
          type="button"
          onClick={() => setDrafts((list) => [...list, { id: `zone-${Date.now().toString(36)}`, label: `Zone ${list.length + 1}`, fee: "0.00", radius: "", text: "" }])}
          className="press flex h-11 items-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold ring-1 ring-cream/15 hover:bg-cream/5"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add zone
        </button>
      </div>
    </form>
  );
}
