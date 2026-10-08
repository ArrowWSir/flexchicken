// Browser bindings for the storage functions in card.js, which take their
// storage and cookie access as arguments so they can be tested without a DOM.

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

const NO_STORAGE = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export function browserEnv() {
  let storage = NO_STORAGE;
  try {
    storage = window.localStorage ?? NO_STORAGE;
  } catch {
    // Blocked site data: fall back to the cookie alone.
  }
  return { storage, cookie: { get: getCookie, set: setCookie } };
}
