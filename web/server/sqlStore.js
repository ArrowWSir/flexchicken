// The repo's store (read / write) over the Durable Object's SQLite.
//
// Small values (settings, menu edits, the order counter) are one row each.
// Lists that grow (orders, cards, shifts...) keep one row per item, so no row
// nears SQLite's size limit and a change rewrites only the items it touched.
// Values are cached in memory: reads cost nothing while the object is awake.
//
// Writes wait in `pending` until the action's transaction commits, so an
// action that fails half way leaves both the database and the cache as they were.

const PHOTO_TYPES = { webp: "image/webp", jpeg: "image/jpeg", png: "image/png" };

// Topic -> how to find an item's id. "map" topics are objects keyed by id.
export const COLLECTIONS = Object.freeze({
  orders: { idOf: (o) => o.id },
  shifts: { idOf: (s) => s.id },
  staff: { idOf: (s) => s.id },
  loyalty_cards: { idOf: (c) => c.id },
  stamp_tokens: { idOf: (t) => t.token },
  promotions: { idOf: (p) => p.id },
  expense_sheets: { idOf: (s) => s.id },
  print_jobs: { idOf: (j) => j.id },
  driver_locations: { isMap: true },
});

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS items (topic TEXT NOT NULL, id TEXT NOT NULL, seq INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY (topic, id))",
  "CREATE INDEX IF NOT EXISTS items_by_seq ON items (topic, seq)",
  "CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, type TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL)",
];

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export const DUMP_VERSION = 1;

/** @param {{ sql: { exec: Function }, transactionSync: Function }} storage the Durable Object's ctx.storage */
export function createSqlStore(storage, now = Date.now) {
  const { sql } = storage;
  for (const statement of SCHEMA) sql.exec(statement);

  const cache = new Map(); // topic -> value as committed
  const seqs = new Map(); // list topic -> Map(id -> seq)
  const saved = new Map(); // collection topic -> Map(id -> JSON as stored)
  let pending = null; // Map(topic -> value) inside a transaction

  function load(topic) {
    const kind = COLLECTIONS[topic];
    if (!kind) {
      const row = sql.exec("SELECT value FROM kv WHERE key = ?", topic).toArray()[0];
      cache.set(topic, row ? JSON.parse(row.value) : undefined);
      return;
    }
    const rows = sql.exec("SELECT id, seq, value FROM items WHERE topic = ? ORDER BY seq", topic).toArray();
    saved.set(topic, new Map(rows.map((r) => [r.id, r.value])));
    if (kind.isMap) {
      cache.set(topic, rows.length ? Object.fromEntries(rows.map((r) => [r.id, JSON.parse(r.value)])) : undefined);
      return;
    }
    seqs.set(topic, new Map(rows.map((r) => [r.id, r.seq])));
    cache.set(topic, rows.length ? rows.map((r) => JSON.parse(r.value)) : undefined);
  }

  function committed(topic) {
    if (!cache.has(topic)) load(topic);
    return cache.get(topic);
  }

  function read(topic, fallback) {
    const value = pending?.has(topic) ? pending.get(topic) : committed(topic);
    return value === undefined ? fallback : value;
  }

  // Writes a row only when its contents (or place) really changed: the repo
  // rebuilds list objects on every read, so object identity is not enough.
  const upsert = (topic, id, seq, item, isMoved = false) => {
    const json = JSON.stringify(item);
    const rows = saved.get(topic) ?? new Map();
    if (!isMoved && rows.get(id) === json) return;
    sql.exec("INSERT INTO items (topic, id, seq, value) VALUES (?, ?, ?, ?) ON CONFLICT (topic, id) DO UPDATE SET seq = excluded.seq, value = excluded.value", topic, id, seq, json);
    rows.set(id, json);
    saved.set(topic, rows);
  };
  const remove = (topic, id) => {
    sql.exec("DELETE FROM items WHERE topic = ? AND id = ?", topic, id);
    saved.get(topic)?.delete(id);
  };

  function saveMap(topic, next) {
    const old = committed(topic) ?? {};
    for (const id of Object.keys(old)) if (!Object.hasOwn(next, id)) remove(topic, id);
    for (const [id, item] of Object.entries(next)) if (old[id] !== item) upsert(topic, id, 0, item);
  }

  function saveList(topic, next, idOf) {
    const old = committed(topic) ?? [];
    const oldById = new Map(old.map((item) => [String(idOf(item)), item]));
    const known = seqs.get(topic) ?? new Map();
    let top = Math.max(-1, ...known.values());
    // New items go after the rest; if that breaks the list's order (an item
    // put first, say), every row is renumbered.
    const planned = next.map((item) => {
      const id = String(idOf(item));
      return { id, item, seq: known.get(id) ?? (top += 1) };
    });
    const isInOrder = planned.every((p, i) => i === 0 || p.seq > planned[i - 1].seq);
    if (!isInOrder) planned.forEach((p, i) => (p.seq = i));
    const keep = new Set(planned.map((p) => p.id));
    for (const id of oldById.keys()) if (!keep.has(id)) remove(topic, id);
    for (const p of planned) {
      const isNew = !known.has(p.id);
      if (!isInOrder || isNew || oldById.get(p.id) !== p.item) upsert(topic, p.id, p.seq, p.item, !isInOrder || isNew);
    }
    seqs.set(topic, new Map(planned.map((p) => [p.id, p.seq])));
  }

  function save(topic, value) {
    const kind = COLLECTIONS[topic];
    if (kind?.isMap) saveMap(topic, value ?? {});
    else if (kind) saveList(topic, Array.isArray(value) ? value : [], kind.idOf);
    else sql.exec("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", topic, JSON.stringify(value ?? null));
    cache.set(topic, value);
  }

  function write(topic, value) {
    if (pending) pending.set(topic, value);
    else transaction(() => write(topic, value));
  }

  /** Runs `fn` (synchronous) as one all-or-nothing change. */
  function transaction(fn) {
    if (pending) return fn();
    pending = new Map();
    const backup = { cache: new Map(cache), seqs: new Map(seqs), saved: new Map([...saved].map(([t, rows]) => [t, new Map(rows)])) };
    try {
      return storage.transactionSync(() => {
        const out = fn();
        for (const [topic, value] of pending) save(topic, value);
        return out;
      });
    } catch (err) {
      // The database rolled back; put the cache back with it.
      cache.clear();
      backup.cache.forEach((v, k) => cache.set(k, v));
      seqs.clear();
      backup.seqs.forEach((v, k) => seqs.set(k, v));
      saved.clear();
      backup.saved.forEach((v, k) => saved.set(k, v));
      throw err;
    } finally {
      pending = null;
    }
  }

  /** Stores an uploaded photo; returns the address the menu uses for it. */
  function savePhoto(dataUrl, id) {
    const match = /^data:image\/(webp|jpeg|png);base64,(.+)$/.exec(dataUrl);
    if (!match) throw new Error("That photo could not be used. Pick a JPEG, PNG or WebP photo.");
    sql.exec("INSERT INTO photos (id, type, data, created_at) VALUES (?, ?, ?, ?)", id, PHOTO_TYPES[match[1]], decodeBase64(match[2]), now());
    return `/api/photo/${id}.${match[1]}`;
  }

  /** Deletes uploaded photos the menu no longer uses. */
  function prunePhotos(keepIds) {
    sql.exec("DELETE FROM photos WHERE id NOT IN (SELECT value FROM json_each(?))", JSON.stringify(keepIds));
  }

  function readPhoto(id) {
    const row = sql.exec("SELECT type, data FROM photos WHERE id = ?", id).toArray()[0];
    return row ? { type: row.type, data: row.data } : null;
  }

  /** Every row, for moving the shop to another Cloudflare account. */
  function dump() {
    return {
      version: DUMP_VERSION,
      kv: sql.exec("SELECT key, value FROM kv").toArray().map((r) => ({ key: r.key, value: r.value })),
      items: sql.exec("SELECT topic, id, seq, value FROM items ORDER BY topic, seq").toArray().map((r) => ({ topic: r.topic, id: r.id, seq: r.seq, value: r.value })),
      photos: sql.exec("SELECT id, type, data, created_at FROM photos").toArray().map((r) => ({ id: r.id, type: r.type, data: encodeBase64(r.data), createdAt: r.created_at })),
    };
  }

  const isEmpty = () =>
    ["kv", "items", "photos"].every((table) => sql.exec(`SELECT COUNT(*) AS n FROM ${table}`).toArray()[0].n === 0);

  /** Loads a dump into an empty database, all or nothing. */
  function restore(data) {
    if (data?.version !== DUMP_VERSION || !Array.isArray(data.kv) || !Array.isArray(data.items) || !Array.isArray(data.photos)) {
      throw new Error("That export could not be read.");
    }
    if (!isEmpty()) throw new Error("This shop already has data. An export only goes into an empty one.");
    const text = (v) => typeof v === "string";
    storage.transactionSync(() => {
      for (const r of data.kv) {
        if (!text(r.key) || !text(r.value)) throw new Error("That export could not be read.");
        sql.exec("INSERT INTO kv (key, value) VALUES (?, ?)", r.key, r.value);
      }
      for (const r of data.items) {
        if (!text(r.topic) || !text(r.id) || !Number.isInteger(r.seq) || !text(r.value)) throw new Error("That export could not be read.");
        sql.exec("INSERT INTO items (topic, id, seq, value) VALUES (?, ?, ?, ?)", r.topic, r.id, r.seq, r.value);
      }
      for (const r of data.photos) {
        if (!text(r.id) || !/^image\/(webp|jpeg|png)$/.test(r.type ?? "") || !text(r.data)) throw new Error("That export could not be read.");
        sql.exec("INSERT INTO photos (id, type, data, created_at) VALUES (?, ?, ?, ?)", r.id, r.type, decodeBase64(r.data), Number(r.createdAt) || now());
      }
    });
    // The cache knew nothing of these rows; read everything fresh.
    cache.clear();
    seqs.clear();
    saved.clear();
    return { kv: data.kv.length, items: data.items.length, photos: data.photos.length };
  }

  return { read, write, subscribe: () => () => {}, transaction, savePhoto, readPhoto, prunePhotos, dump, restore };
}
