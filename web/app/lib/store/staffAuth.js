// Sign-in for the staff screens (/admin, /driver).
//
// Cloud: the shift code is checked by the server, which sets an HttpOnly
// cookie; the codes are Worker secrets and never reach the browser.
// Local (dev, tests, the shop's own Wi-Fi): the code is compared in the
// browser, a lock on the door rather than security.
import { IS_CLOUD, getRepo } from "./index";

// Spelled out (not IS_CLOUD) so the build drops the local defaults from the
// live bundle: the cloud checks codes on the server only.
const LOCAL_PINS =
  process.env.NEXT_PUBLIC_STORE === "cloud"
    ? {}
    : {
        admin: process.env.NEXT_PUBLIC_ADMIN_PIN || "2580",
        driver: process.env.NEXT_PUBLIC_DRIVER_PIN || "1111",
      };
const KEY = (role) => `fc_staff_${role}`;
const CODE_KEY = (which) => `fc_local_code_${which}`;
const codeKind = (role) => (role === "driver" ? "driver" : "admin"); // the clock opens with the owner's code
const CODE_SHAPE = /^\d{4,8}$/;

// Local builds keep a changed code on this device only.
function localCode(role) {
  const kind = codeKind(role);
  try {
    return localStorage.getItem(CODE_KEY(kind)) || LOCAL_PINS[kind];
  } catch {
    return LOCAL_PINS[kind];
  }
}

function readSaved(role) {
  try {
    return JSON.parse(localStorage.getItem(KEY(role)));
  } catch {
    return null;
  }
}

function save(role, record) {
  try {
    if (record) localStorage.setItem(KEY(role), JSON.stringify(record));
    else localStorage.removeItem(KEY(role));
  } catch {
    // Blocked storage: signed in for this visit only.
  }
}

async function api(path, body) {
  let response;
  try {
    response = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json", "x-flexchicken": "1" }, body: JSON.stringify(body) } : {});
  } catch {
    const error = new Error("We couldn't reach the shop. Check your connection and try again.");
    error.isOffline = true;
    throw error;
  }
  const data = await response.json().catch(() => null);
  if (!data?.ok) throw new Error(data?.error ?? "Sign-in is not working right now. Try again.");
  return data.data;
}

const localAuth = {
  async current(role) {
    return readSaved(role);
  },
  async signIn(role, pin, name) {
    if (pin !== localCode(role)) throw new Error("That code is not right.");
    const clean = String(name ?? "").trim().slice(0, 30);
    if (role === "driver" && !clean) throw new Error("Enter your name.");
    const record = role === "driver" ? { role, name: clean, id: `drv_${clean.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` } : { role, name: "Kitchen", id: "kitchen" };
    save(role, record);
    return record;
  },
  async signOut(role) {
    save(role, null);
  },
  async changeCode(role, current, next) {
    if (current !== localCode("admin")) throw new Error("Your current owner's code is not right.");
    if (!CODE_SHAPE.test(next ?? "")) throw new Error("Use 4 to 8 digits for the new code.");
    if (next === localCode(role === "admin" ? "driver" : "admin")) throw new Error("The owner's code and the driver code must be different.");
    try {
      localStorage.setItem(CODE_KEY(role), next);
    } catch {
      throw new Error("This device could not save the new code.");
    }
  },
};

const cloudAuth = {
  async current(role) {
    try {
      const record = await api(`/api/staff/me?as=${role}`);
      save(role, record);
      if (record) getRepo().setStaffRole(role);
      return record;
    } catch (err) {
      // Offline: show the screen as last signed in; its actions will say
      // when the shop cannot be reached.
      if (!err.isOffline) return null;
      const saved = readSaved(role);
      if (saved) getRepo().setStaffRole(role);
      return saved;
    }
  },
  async signIn(role, pin, name) {
    const record = await api("/api/staff/login", { role, pin, name });
    save(role, record);
    getRepo().setStaffRole(role);
    return record;
  },
  async signOut(role) {
    save(role, null);
    await api("/api/staff/logout", { role }).catch(() => {});
  },
  /** The owner changes the owner's or the drivers' code; this device stays signed in. */
  async changeCode(role, current, next) {
    await api("/api/staff/code", { as: "admin", role, current, next });
  },
};

export const staffAuth = IS_CLOUD ? cloudAuth : localAuth;
