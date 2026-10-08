import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import { createSqlStore } from "./sqlStore";

// The Durable Object's `ctx.storage` shape, over Node's built-in SQLite.
function fakeStorage() {
  const db = new DatabaseSync(":memory:");
  const statements = [];
  const sql = {
    exec(query, ...binds) {
      statements.push(query.trim().split(/\s+/)[0].toUpperCase());
      const stmt = db.prepare(query);
      const rows = /^\s*SELECT/i.test(query) ? stmt.all(...binds) : (stmt.run(...binds), []);
      return { toArray: () => rows, one: () => rows[0] };
    },
  };
  const transactionSync = (fn) => {
    db.exec("BEGIN");
    try {
      const out = fn();
      db.exec("COMMIT");
      return out;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
  return { storage: { sql, transactionSync }, statements, db };
}

const order = (id, extra = {}) => ({ id, status: "placed", ...extra });

describe("sqlStore", () => {
  test("gives back what was written, after a restart too", () => {
    const { storage } = fakeStorage();
    const store = createSqlStore(storage);
    store.transaction(() => {
      store.write("orders", [order("a"), order("b")]);
      store.write("settings", { prepMinutes: 25 });
      store.write("order_sequence", 2);
    });
    const again = createSqlStore(storage);
    expect(again.read("orders", [])).toEqual([order("a"), order("b")]);
    expect(again.read("settings", null)).toEqual({ prepMinutes: 25 });
    expect(again.read("order_sequence", 0)).toBe(2);
    expect(again.read("missing", "fallback")).toBe("fallback");
  });

  test("keeps each order in its own row and rewrites only the changed one", () => {
    const { storage, statements } = fakeStorage();
    const store = createSqlStore(storage);
    const a = order("a");
    store.transaction(() => store.write("orders", [a, order("b")]));
    statements.length = 0;
    store.transaction(() => store.write("orders", [a, order("b", { status: "accepted" }), order("c")]));
    expect(statements.filter((s) => s === "INSERT")).toHaveLength(2);
    expect(createSqlStore(storage).read("orders", []).map((o) => o.status)).toEqual(["placed", "accepted", "placed"]);
  });

  test("leaves a row alone when a rebuilt item has the same contents", () => {
    const { storage, statements } = fakeStorage();
    const store = createSqlStore(storage);
    store.transaction(() => store.write("loyalty_cards", [{ id: "c1", stamps: 1 }, { id: "c2", stamps: 0 }]));
    statements.length = 0;
    store.transaction(() => store.write("loyalty_cards", [{ id: "c1", stamps: 2 }, { id: "c2", stamps: 0 }]));
    expect(statements.filter((s) => s === "INSERT")).toHaveLength(1);
  });

  test("deletes photos the menu stopped using", () => {
    const { storage } = fakeStorage();
    const store = createSqlStore(storage);
    store.savePhoto("data:image/webp;base64,AAEC", "ph_1");
    store.savePhoto("data:image/webp;base64,AAEC", "ph_2");
    store.prunePhotos(["ph_2"]);
    expect(store.readPhoto("ph_1")).toBeNull();
    expect(store.readPhoto("ph_2")).not.toBeNull();
  });

  test("keeps the list's order when an item is put first", () => {
    const { storage } = fakeStorage();
    const store = createSqlStore(storage);
    store.transaction(() => store.write("promotions", [{ id: "p1" }, { id: "p2" }]));
    store.transaction(() => store.write("promotions", [{ id: "p3" }, { id: "p1" }, { id: "p2" }]));
    expect(createSqlStore(storage).read("promotions", []).map((p) => p.id)).toEqual(["p3", "p1", "p2"]);
  });

  test("deletes rows that left the list", () => {
    const { storage } = fakeStorage();
    const store = createSqlStore(storage);
    store.transaction(() => store.write("orders", [order("a"), order("b"), order("c")]));
    store.transaction(() => store.write("orders", [order("c")]));
    expect(createSqlStore(storage).read("orders", []).map((o) => o.id)).toEqual(["c"]);
  });

  test("stores driver locations by order", () => {
    const { storage } = fakeStorage();
    const store = createSqlStore(storage);
    store.transaction(() => store.write("driver_locations", { o1: { latitude: 1 }, o2: { latitude: 2 } }));
    store.transaction(() => store.write("driver_locations", { o2: { latitude: 3 } }));
    expect(createSqlStore(storage).read("driver_locations", {})).toEqual({ o2: { latitude: 3 } });
  });

  test("a failed action leaves nothing behind", () => {
    const { storage } = fakeStorage();
    const store = createSqlStore(storage);
    store.transaction(() => store.write("loyalty_cards", [{ id: "c1", stamps: 1 }]));
    expect(() =>
      store.transaction(() => {
        store.write("loyalty_cards", [{ id: "c1", stamps: 2 }]);
        expect(store.read("loyalty_cards", [])[0].stamps).toBe(2);
        throw new Error("token already used");
      })
    ).toThrow("token already used");
    expect(store.read("loyalty_cards", [])[0].stamps).toBe(1);
    expect(createSqlStore(storage).read("loyalty_cards", [])[0].stamps).toBe(1);
  });

  test("keeps photos and serves them back", () => {
    const { storage } = fakeStorage();
    const store = createSqlStore(storage);
    const url = store.savePhoto("data:image/webp;base64,AAEC", "ph_1");
    expect(url).toBe("/api/photo/ph_1.webp");
    const photo = createSqlStore(storage).readPhoto("ph_1");
    expect(photo.type).toBe("image/webp");
    expect([...new Uint8Array(photo.data)]).toEqual([0, 1, 2]);
    expect(store.readPhoto("nope")).toBeNull();
  });
});
