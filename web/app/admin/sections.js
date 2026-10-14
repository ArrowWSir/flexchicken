import { BadgePercent, ChefHat, ClipboardList, IdCard, Store, Users, UtensilsCrossed } from "lucide-react";

// The admin is two rooms. Service is the shift: orders coming in and cards
// being stamped, worked fast on a tablet by the counter. Studio is the back
// office: what the website sells and says, changed between rushes.
export const MODES = [
  {
    id: "service",
    label: "Service",
    blurb: "Take orders and stamp cards",
    sections: [
      { href: "/admin/orders", label: "Orders", icon: ChefHat },
      { href: "/admin/cards", label: "Cards", icon: IdCard },
    ],
  },
  {
    id: "studio",
    label: "Studio",
    blurb: "Edit the menu, offers, shop and team; make order lists",
    sections: [
      { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
      { href: "/admin/offers", label: "Offers", icon: BadgePercent },
      { href: "/admin/shop", label: "Shop & delivery", short: "Shop", icon: Store },
      { href: "/admin/staff", label: "Staff & hours", short: "Staff", icon: Users },
      { href: "/admin/order-list", label: "Order list", icon: ClipboardList },
    ],
  },
];

/** The room a path belongs to, or null on the admin home. */
export function modeOf(pathname) {
  return MODES.find((mode) => mode.sections.some((s) => pathname.startsWith(s.href))) ?? null;
}
