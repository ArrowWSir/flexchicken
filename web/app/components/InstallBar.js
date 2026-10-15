"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Plus, Share, SquarePlus, X } from "lucide-react";
import { APPS, appFor } from "../lib/apps";

const HIDDEN_KEY = "fc_install_hidden"; // closed for this visit (sessionStorage)

// The layout's inline script (CATCH_INSTALL in lib/apps.js) keeps Chrome's
// install prompt on window.__fcInstall, as it can come before React loads.

const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
// iPhone and iPad (which says it is a Mac) add to the home screen from the Share menu only.
const isApple = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

function readHidden() {
  try {
    return sessionStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** How this browser installs: "prompt" (Chrome, Edge, Samsung), "apple" (Share menu), or null (cannot, or done). */
function useInstallWay() {
  const [way, setWay] = useState(null);
  useEffect(() => {
    if (isInstalled()) return undefined;
    const update = () => setWay(window.__fcInstall ? "prompt" : isApple() ? "apple" : null);
    update();
    window.addEventListener("fc-install", update);
    return () => window.removeEventListener("fc-install", update);
  }, []);
  return way;
}

function AppleSteps({ isDark }) {
  const icon = "mx-0.5 inline size-4 align-[-3px]";
  return (
    <ol className={`mx-auto mt-2 grid max-w-[560px] list-decimal gap-1 pl-5 text-[13.5px] leading-snug marker:font-bold ${isDark ? "text-cream/80" : "text-ink/80"}`}>
      <li>
        Tap <Share className={icon} aria-hidden="true" /> <strong>Share</strong> in Safari&rsquo;s bar.
      </li>
      <li>
        Scroll down, tap <SquarePlus className={icon} aria-hidden="true" /> <strong>Add to Home Screen</strong>.
      </li>
      <li>
        Tap <strong>Add</strong>.
      </li>
    </ol>
  );
}

/**
 * "Add to Home Screen", at the top of every page until the app is on the
 * device: Chrome's own install prompt on Android and the till, or the steps
 * for the Share menu on iPhone. Each screen installs as its own app.
 */
export default function InstallBar() {
  const pathname = usePathname();
  const way = useInstallWay();
  const [isHidden, setIsHidden] = useState(false);
  const [isShowingSteps, setIsShowingSteps] = useState(false);

  useEffect(() => {
    if (readHidden()) setIsHidden(true);
  }, []);

  if (!way || isHidden) return null;
  const app = APPS[appFor(pathname)];
  const isDark = app.background !== APPS.customer.background;

  const add = async () => {
    if (way === "apple") {
      setIsShowingSteps((s) => !s);
      return;
    }
    const prompt = window.__fcInstall;
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // A prompt is used once; Chrome offers a new one later if it was declined.
    window.__fcInstall = null;
    if (outcome === "accepted") setIsHidden(true);
    window.dispatchEvent(new Event("fc-install"));
  };
  const hide = () => {
    try {
      sessionStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // Hidden for this page view only.
    }
    setIsHidden(true);
  };

  return (
    <aside
      aria-label="Add to Home Screen"
      className={`relative z-40 px-3 py-2 ${isDark ? "on-dark border-b border-cream/10 bg-roast-900 text-cream" : "border-b border-line bg-ground-raised text-ink"}`}
    >
      <div className="mx-auto flex max-w-[1600px] items-center gap-2.5">
        <img src="/brand/icon-192.png" alt="" width={32} height={32} className="size-8 shrink-0 rounded-lg max-[359px]:hidden" />
        <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-tight">
          Get {app.label} on your home screen
          <span className={`block text-[12px] font-normal max-[399px]:hidden ${isDark ? "text-cream/65" : "text-muted"}`}>Opens full screen, like an app.</span>
        </p>
        <button
          type="button"
          onClick={add}
          aria-expanded={way === "apple" ? isShowingSteps : undefined}
          className="press flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-flex px-3.5 text-[13.5px] font-bold text-white"
        >
          <Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />
          Add<span className="max-[479px]:sr-only">&nbsp;to Home Screen</span>
        </button>
        <button
          type="button"
          onClick={hide}
          aria-label="Hide for now"
          className={`press flex size-11 shrink-0 items-center justify-center rounded-xl ${isDark ? "text-cream/70 hover:bg-cream/10" : "text-muted hover:bg-ink/5"}`}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {way === "apple" && isShowingSteps && <AppleSteps isDark={isDark} />}
    </aside>
  );
}
