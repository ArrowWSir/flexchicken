"use client";
import { usePathname } from "next/navigation";
import { LayoutGrid, LogOut } from "lucide-react";
import StaffGate, { signOutStaff } from "../components/staff/StaffGate";
import { MODES, modeOf } from "./sections";
import OrderAlerts from "./OrderAlerts";

// The kitchen's screens are dark: easier on the eyes on a pass, and the
// tickets stand out like paper dockets. The bar has two rows: which room
// (Service or Studio), then that room's pages.
export default function AdminShell({ children }) {
  const pathname = usePathname();
  const mode = modeOf(pathname);
  const isHome = pathname === "/admin";
  return (
    <StaffGate role="admin" title="Kitchen & admin">
      {() => (
        <div className="on-dark min-h-dvh bg-roast-950 text-cream">
          <header className="sticky top-0 z-30 border-b border-cream/10 bg-roast-950/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
            {/* Phones under 400px: the logo is the way home, so the Home icon goes. */}
            <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-1 px-3 min-[400px]:gap-2 sm:gap-3 sm:px-5">
              <a href="/admin" className="shrink-0 rounded-md" aria-label="Admin home">
                <img src="/brand/logo-on-dark.svg" alt="Flex Chicken" width={57} height={32} className="h-6 w-auto min-[400px]:h-8" />
              </a>
              <nav aria-label="Admin rooms" className="flex min-w-0 flex-1 justify-center">
                <span className="flex rounded-2xl bg-cream/8 p-1 ring-1 ring-cream/10">
                  <a
                    href="/admin"
                    aria-current={isHome ? "page" : undefined}
                    aria-label="Home"
                    className={`press flex h-9 items-center rounded-xl px-2.5 max-[399px]:hidden ${isHome ? "bg-cream text-roast-900" : "text-cream/70 hover:text-cream"}`}
                  >
                    <LayoutGrid className="size-4" aria-hidden="true" />
                  </a>
                  {MODES.map((m) => (
                    <a
                      key={m.id}
                      href={m.sections[0].href}
                      aria-current={mode?.id === m.id ? "true" : undefined}
                      className={`press flex h-9 items-center rounded-xl px-2.5 text-[12.5px] font-bold uppercase min-[400px]:px-3.5 min-[400px]:text-[13.5px] min-[400px]:tracking-[0.04em] ${
                        mode?.id === m.id ? (m.id === "service" ? "bg-flex text-white" : "bg-flame-light text-roast-950") : "text-cream/70 hover:text-cream"
                      }`}
                    >
                      {m.label}
                    </a>
                  ))}
                </span>
              </nav>
              <OrderAlerts />
              <button
                type="button"
                onClick={() => signOutStaff("admin")}
                className="press flex size-9 shrink-0 items-center justify-center rounded-xl text-cream/70 hover:bg-cream/10 hover:text-cream min-[400px]:size-10"
                aria-label="Lock the admin screen"
              >
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </div>
            {mode && (
              <nav aria-label={`${mode.label} pages`} className="no-scrollbar mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-3 pb-2 sm:px-5">
                {mode.sections.map(({ href, label, short, icon: Icon }) => {
                  const isActive = pathname.startsWith(href);
                  return (
                    <a
                      key={href}
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      className={`press flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ${
                        isActive ? "bg-cream text-roast-900" : "text-cream/75 ring-1 ring-cream/10 hover:bg-cream/10 hover:text-cream"
                      }`}
                    >
                      <Icon className="size-4" strokeWidth={2.1} aria-hidden="true" />
                      {short ? (
                        <>
                          <span className="sm:hidden">{short}</span>
                          <span className="max-sm:hidden">{label}</span>
                        </>
                      ) : (
                        label
                      )}
                    </a>
                  );
                })}
              </nav>
            )}
          </header>
          <main className="mx-auto max-w-[1600px] px-3 pb-10 pt-4 sm:px-5">{children}</main>
        </div>
      )}
    </StaffGate>
  );
}
