import { Bike, Clock, Mail, MapPin, Phone } from "lucide-react";
import { BRAND } from "../lib/brand";
import MenuDownload from "./menu/MenuDownload";
import DeliveryTerms from "./DeliveryTerms";
import OpeningHours from "./OpeningHours";

// Lucide no longer ships brand marks, so the Instagram glyph is drawn here.
function InstagramGlyph(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

const CONTACT = [
  { icon: Phone, label: "Call us", text: BRAND.phone.label, href: BRAND.phone.href },
  { icon: Mail, label: "Email", text: BRAND.email, href: `mailto:${BRAND.email}` },
  { icon: MapPin, label: "Find us", text: BRAND.address.short, href: BRAND.address.mapsUrl, isExternal: true },
  { icon: Clock, label: "Open", text: <OpeningHours /> },
  {
    icon: Bike,
    label: "Delivery",
    text: <DeliveryTerms />,
  },
  { icon: InstagramGlyph, label: "Instagram", text: BRAND.instagram.handle, href: BRAND.instagram.url, isExternal: true },
];

const LEGAL = [
  { label: "Allergens", href: "/allergens" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
];

function ContactRow({ icon: Icon, label, text, href, isExternal }) {
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cream/8 text-flame-light">
        <Icon className="size-[18px]" strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-cream/60">{label}</span>
        <span className="block text-[14px] font-medium text-cream">{text}</span>
      </span>
    </>
  );
  return (
    <li>
      {href ? (
        <a
          href={href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noreferrer" : undefined}
          className="press flex items-center gap-3.5 rounded-2xl p-2 -m-2 hover:bg-cream/5"
        >
          {body}
        </a>
      ) : (
        <span className="flex items-center gap-3.5">{body}</span>
      )}
    </li>
  );
}

// Contact lives here, at the foot of every page: dark roast, the 30 of the
// 60-30-10. The logo is the designer's version for dark grounds.
export default function SiteFooter() {
  return (
    <footer id="contact" aria-labelledby="contact-heading" className="on-dark relative z-[1] mt-20 bg-roast-900 text-cream">
      <div className="flame-rule h-[3px]" aria-hidden="true" />
      <div className="page-gutter mx-auto max-w-[760px] pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-10">
        <img src="/brand/logo-on-dark.svg" alt="Flex Chicken" width={113} height={64} className="h-16 w-auto" />

        <h2 id="contact-heading" className="mt-8 font-display text-[24px] font-black uppercase tracking-[-0.01em]">
          Contact us
        </h2>
        <ul className="mt-5 grid gap-5 sm:grid-cols-2">
          {CONTACT.map((row) => (
            <ContactRow key={row.label} {...row} />
          ))}
        </ul>

        <MenuDownload className="press mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-cream px-4 text-[14px] font-semibold text-roast-900 hover:bg-white" label="Download the full menu" />

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-cream/10 pt-6">
          <nav aria-label="Legal" className="flex gap-5 text-[12.5px] font-medium">
            {LEGAL.map((link) => (
              <a key={link.href} href={link.href} className="text-cream/70 underline-offset-4 hover:text-cream hover:underline">
                {link.label}
              </a>
            ))}
          </nav>
          <p className="text-[11.5px] text-cream/60">
            © {new Date().getFullYear()} {BRAND.legalName}
          </p>
        </div>
      </div>
    </footer>
  );
}
