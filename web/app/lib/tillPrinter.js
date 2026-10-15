// Which screen is the till, and how its last try at the printer went. Only
// the till sends receipts to the printer on the shop's network: a phone
// accepting an order on mobile data could never reach it. The owner marks
// the till once, in Admin → Shop, on the till itself; it is kept on that
// device only.

const TILL_KEY = "fc_till_printer";
const listeners = new Set();
let reach = { state: "unknown", at: null };

const notify = () => listeners.forEach((fn) => fn());

/** Calls `fn` when this device's till setting or its reach to the printer changes. */
export function subscribeTill(fn) {
  listeners.add(fn);
  const onStorage = (e) => e.key === TILL_KEY && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/** True when this device is the till that sends receipts to the printer. */
export function isThisTill() {
  try {
    return localStorage.getItem(TILL_KEY) === "1";
  } catch {
    return false;
  }
}

/** Marks this device as the till, or not. Throws when the browser keeps nothing. */
export function setThisTill(isTill) {
  if (isTill) localStorage.setItem(TILL_KEY, "1");
  else localStorage.removeItem(TILL_KEY);
  notify();
}

/** How the till's last try at the printer went: "unknown", "ok" or "unreachable", and when. */
export const tillReach = () => reach;

export function setTillReach(state, at) {
  if (reach.state === state) return;
  reach = { state, at };
  notify();
}
