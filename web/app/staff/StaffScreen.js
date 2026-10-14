"use client";
import { usePathname } from "next/navigation";
import { ChefHat, IdCard, LogOut } from "lucide-react";
import StaffGate, { signOutStaff } from "../components/staff/StaffGate";
import OrderAlerts from "../admin/OrderAlerts";

const PAGES = [
  { href: "/staff", label: "Orders", icon: ChefHat },
  { href: "/staff/cards", label: "Cards", icon: IdCard },
];

// The counter and kitchen's own screen: the orders board and the card desk
// from the admin, behind the staff code. Menu, prices, offers, the team and
// the shop's settings stay with the owner in /admin.
export default function StaffScreen({ children }) {
  const pathname = usePathname();
  return (
    <StaffGate role="staff" title="Orders & cards">
      {() => (
        <div className="on-dark min-h-dvh bg-roast-950 text-cream">
          <header className="sticky top-0 z-30 border-b border-cream/10 bg-roast-950/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-1 px-3 min-[400px]:gap-2 sm:gap-3 sm:px-5">
              <a href="/staff" className="shrink-0 rounded-md" aria-label="Orders">
                <img src="/brand/logo-on-dark.svg" alt="Flex Chicken" width={57} height={32} className="h-6 w-auto min-[400px]:h-8" />
              </a>
              <nav aria-label="Staff pages" className="flex min-w-0 flex-1 justify-center">
                <span className="flex rounded-2xl bg-cream/8 p-1 ring-1 ring-cream/10">
                  {PAGES.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href;
                    return (
                      <a
                        key={href}
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        className={`press flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold uppercase min-[400px]:px-3.5 min-[400px]:tracking-[0.04em] ${
                          isActive ? "bg-cream text-roast-900" : "text-cream/70 hover:text-cream"
                        }`}
                      >
                        <Icon className="size-4 max-[359px]:hidden" aria-hidden="true" />
                        {label}
                      </a>
                    );
                  })}
                </span>
              </nav>
              <OrderAlerts ordersUrl="/staff" />
              <button
                type="button"
                onClick={() => signOutStaff("staff")}
                className="press flex size-9 shrink-0 items-center justify-center rounded-xl text-cream/70 hover:bg-cream/10 hover:text-cream min-[400px]:size-10"
                aria-label="Lock the staff screen"
              >
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </div>
          </header>
          <main className="mx-auto max-w-[1600px] px-3 pb-10 pt-4 sm:px-5">{children}</main>
        </div>
      )}
    </StaffGate>
  );
}
