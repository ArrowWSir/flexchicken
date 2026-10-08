import AppShell from "./components/AppShell";
import TrustStrip from "./components/trust/TrustStrip";
import MenuSection from "./components/stage/MenuSection";
import DrinksSection from "./components/DrinksSection";
import AboutSection from "./components/AboutSection";
import SiteFooter from "./components/SiteFooter";
import { BRAND } from "./lib/brand";

// Search engines read the shop's details from this, as the live site's did.
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: BRAND.name,
  legalName: BRAND.legalName,
  telephone: BRAND.phone.label,
  servesCuisine: ["Chicken", "Burgers", "Fast Food"],
  priceRange: "£",
  address: {
    "@type": "PostalAddress",
    streetAddress: BRAND.address.street,
    addressLocality: BRAND.address.locality,
    addressRegion: "London",
    postalCode: BRAND.address.postcode,
    addressCountry: "GB",
  },
  geo: { "@type": "GeoCoordinates", ...BRAND.geo },
  openingHoursSpecification: Object.keys(BRAND.hours.schedule).map((day) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: `https://schema.org/${day[0].toUpperCase()}${day.slice(1)}`,
    opens: BRAND.hours.schedule[day][0],
    closes: BRAND.hours.schedule[day][1],
  })),
  sameAs: [BRAND.instagram.url],
};

export default function HomePage() {
  return (
    <>
      {/* `<` escaped so no value can close the script tag early. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      <AppShell>
        <TrustStrip />
        <MenuSection />
        <DrinksSection />
        <AboutSection />
      </AppShell>
      <SiteFooter />
    </>
  );
}
