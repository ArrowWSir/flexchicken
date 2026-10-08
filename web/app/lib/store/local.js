// Local adapter: JSON values in localStorage, with a message channel so every
// open tab of this browser hears about a change at once. It lets the customer
// site, the kitchen screen and the driver screen work together before there is
// a backend; the Supabase adapter will expose the same four functions.

const PREFIX = "fc_store_";

/**
 * @param {{ storage: Storage, channel?: { postMessage: Function, onmessage: Function | null } | null }} deps
 */
export function createLocalStore({ storage, channel = null }) {
  const listeners = new Map(); // key -> Set<fn>

  const emit = (key) => listeners.get(key)?.forEach((fn) => fn());

  if (channel) {
    channel.onmessage = (event) => {
      if (event?.data?.key) emit(event.data.key);
    };
  }

  function read(key, fallback) {
    try {
      const raw = storage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      storage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the change still reaches this tab below.
      throw new Error("This device could not save the change. Free some space and try again.");
    } finally {
      emit(key);
      channel?.postMessage({ key });
    }
  }

  function subscribe(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key)?.delete(fn);
  }

  // Another tab writing localStorage also fires `storage`; used as a fallback
  // where BroadcastChannel is missing.
  function onStorageEvent(event) {
    if (event.key?.startsWith(PREFIX)) emit(event.key.slice(PREFIX.length));
  }

  return { read, write, subscribe, onStorageEvent };
}
