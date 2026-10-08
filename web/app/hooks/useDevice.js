"use client";
import { useEffect, useRef, useState } from "react";
import { getRepo } from "../lib/store";
import { useRepoValue } from "./useShop";

const readSession = (repo) => repo.getSession();

/** The signed-in customer, or null. Same in every tab. */
export function useSession() {
  return useRepoValue("session", readSession, null);
}

export const repoActions = () => getRepo();

/** A clock that ticks, for elapsed times on tickets. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Keeps the screen awake while `isOn` (the driver's phone must not sleep, or
 * the browser stops sending location). Re-acquired when the tab comes back,
 * because the browser drops the lock whenever the page is hidden.
 * @returns {"on" | "off" | "unsupported"}
 */
export function useWakeLock(isOn) {
  const [state, setState] = useState("off");
  const lock = useRef(null);

  useEffect(() => {
    if (!isOn) return undefined;
    if (!("wakeLock" in navigator)) {
      setState("unsupported");
      return undefined;
    }
    let cancelled = false;
    const acquire = async () => {
      try {
        lock.current = await navigator.wakeLock.request("screen");
        if (!cancelled) setState("on");
        lock.current.addEventListener("release", () => !cancelled && setState("off"));
      } catch {
        if (!cancelled) setState("off");
      }
    };
    const onVisible = () => document.visibilityState === "visible" && acquire();
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock.current?.release().catch(() => {});
      lock.current = null;
      setState("off");
    };
  }, [isOn]);

  return state;
}

/**
 * Watches the device's position while `isOn` and hands each fix to `onFix`.
 * @returns {{ status: "idle" | "waiting" | "live" | "denied" | "unavailable", fix: object | null, error: string | null }}
 */
export function useGeoWatch(isOn, onFix) {
  const [state, setState] = useState({ status: "idle", fix: null, error: null });
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  useEffect(() => {
    if (!isOn) {
      setState({ status: "idle", fix: null, error: null });
      return undefined;
    }
    if (!("geolocation" in navigator)) {
      setState({ status: "unavailable", fix: null, error: "This device cannot share its location." });
      return undefined;
    }
    setState((s) => ({ ...s, status: "waiting" }));
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const fix = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        };
        setState({ status: "live", fix, error: null });
        onFixRef.current?.(fix);
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        setState({
          status: denied ? "denied" : "unavailable",
          fix: null,
          error: denied
            ? "Location is blocked. Allow location for this site in your browser settings."
            : "Waiting for a GPS signal. Step outside or check that location is on.",
        });
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [isOn]);

  return state;
}
