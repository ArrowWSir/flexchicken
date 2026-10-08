"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describeStep, fetchRoute, formatDistance, routeProgress } from "../lib/navigation";

const OFF_ROUTE_FIXES = 2; // one stray GPS fix is not a wrong turn
const REROUTE_GAP_MS = 15_000; // never ask for a new route more often than this
const NEAR_TURN_METRES = 100; // second, "now" announcement inside this

/**
 * Directions from the driver's live `fix` to `destination`, fetched once the
 * first fix arrives and fetched again when the driver leaves the route.
 * @returns {{ status: "waiting" | "loading" | "ready" | "error", route: object | null, progress: object | null, error: string | null, retry: () => void }}
 */
export function useTurnByTurn(isOn, fix, destination) {
  const [state, setState] = useState({ status: "waiting", route: null, error: null });
  const [request, setRequest] = useState(0);
  const lastFetchAt = useRef(0);
  const offRouteFixes = useRef(0);
  const fixRef = useRef(fix);
  fixRef.current = fix;
  const hasFix = Boolean(fix);
  // Orders re-read from the store are new objects; only a moved pin refetches.
  const { latitude, longitude } = destination;

  const progress = useMemo(() => (state.route && fix ? routeProgress(state.route, fix) : null), [state.route, fix]);

  // Fetch on the first fix, and on every reroute or retry.
  useEffect(() => {
    if (!isOn || !hasFix) return undefined;
    const controller = new AbortController();
    lastFetchAt.current = Date.now();
    offRouteFixes.current = 0;
    setState((s) => ({ ...s, status: s.route ? "ready" : "loading", error: null }));
    fetchRoute(fixRef.current, { latitude, longitude }, controller.signal)
      .then((route) => setState({ status: "ready", route, error: null }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState((s) => ({ ...s, status: s.route ? "ready" : "error", error: err.message }));
      });
    return () => controller.abort();
  }, [isOn, hasFix, latitude, longitude, request]);

  // Off the line for a couple of fixes in a row: ask for a fresh route.
  useEffect(() => {
    if (!progress) return;
    offRouteFixes.current = progress.isOffRoute ? offRouteFixes.current + 1 : 0;
    if (offRouteFixes.current >= OFF_ROUTE_FIXES && Date.now() - lastFetchAt.current > REROUTE_GAP_MS) {
      setRequest((n) => n + 1);
    }
  }, [progress]);

  const retry = useCallback(() => setRequest((n) => n + 1), []);
  return { ...state, progress, retry };
}

function say(text) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  window.speechSynthesis.speak(utterance);
}

/** Phones only allow speech after a tap, so call this from the tap that opens navigation. */
export function primeSpeech() {
  say("Starting navigation");
}

/** Reads each turn aloud: once when it comes up, and again just before it. */
export function useSpokenDirections(progress, isOn) {
  const spoken = useRef(new Set());
  useEffect(() => {
    if (!isOn || !progress) return;
    const { next, metresToNext } = progress;
    const step = `${next.along.toFixed(0)}`;
    const isNear = metresToNext <= NEAR_TURN_METRES || next.type === "arrive";
    const key = `${step}:${isNear ? "near" : "far"}`;
    if (spoken.current.has(key)) return;
    spoken.current.add(key);
    say(isNear ? describeStep(next) : `In ${formatDistance(metresToNext).replace("yd", "yards").replace("mi", "miles")}, ${describeStep(next)}`);
  }, [progress, isOn]);

  useEffect(() => () => typeof window !== "undefined" && window.speechSynthesis?.cancel(), []);
}
