"use client";
import { useCallback, useEffect, useState } from "react";
import { notificationFor } from "../lib/orderAlert";
import { useFreshOrders } from "./useNewOrderAlert";
import { isOrdersLoaded } from "./useShop";

// This device's choice; the browser's permission is asked for separately.
const PREF_KEY = "fc_admin_notify";
const ORDERS_URL = "/admin/orders";

const isSupported = () => typeof window !== "undefined" && "Notification" in window;

function readPref() {
  try {
    return window.localStorage.getItem(PREF_KEY) === "on";
  } catch {
    return false;
  }
}

function writePref(isOn) {
  try {
    window.localStorage.setItem(PREF_KEY, isOn ? "on" : "off");
  } catch {
    // Blocked storage: notifications stay on until the page reloads.
  }
}

// Phones only show notifications through a service worker.
async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    await navigator.serviceWorker.register("/sw.js");
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function show(order) {
  const { title, body, tag } = notificationFor(order);
  const options = { body, tag, icon: "/brand/icon-192.png", badge: "/brand/icon-192.png", requireInteraction: true, data: { url: ORDERS_URL } };
  const reg = await registration();
  if (reg) return reg.showNotification(title, options);
  const note = new Notification(title, options);
  note.onclick = () => {
    window.focus();
    note.close();
  };
  return note;
}

/**
 * System notifications for new orders while any admin page is open, even in
 * a background tab. `status`: "unsupported" | "default" | "granted" | "denied".
 */
export default function useOrderNotifications(orders) {
  const [state, setState] = useState({ status: "default", isOn: false });

  useEffect(() => {
    if (!isSupported()) return setState({ status: "unsupported", isOn: false });
    const status = Notification.permission;
    const isOn = status === "granted" && readPref();
    setState({ status, isOn });
    if (isOn) registration();
  }, []);

  const turnOn = useCallback(async () => {
    if (!isSupported()) return;
    const status = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    const isOn = status === "granted";
    writePref(isOn);
    setState({ status, isOn });
    if (isOn) await registration();
  }, []);

  const turnOff = useCallback(() => {
    writePref(false);
    setState((s) => ({ ...s, isOn: false }));
  }, []);

  useFreshOrders(orders, "placed", (fresh) => {
    if (!state.isOn) return;
    // A notification that fails to show leaves the board's own chime and
    // title flash; there is nothing more useful to do with the error.
    fresh.forEach((order) => show(order).catch(() => {}));
  }, isOrdersLoaded(orders));

  return { ...state, turnOn, turnOff };
}
