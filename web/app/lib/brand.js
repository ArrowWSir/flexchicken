// Business facts, from site-data/data/business.json (extracted from the live
// site). Brand colours live in globals.css; logo files in public/brand.
export const BRAND = {
  name: "Flex Chicken",
  legalName: "Flex Chicken LTD",
  tagline: "Rainham’s local chicken shop",
  slogan: ["Big flavour.", "Big value.", "Flex your craving."],
  phone: { label: "020 3837 6035", href: "tel:+442038376035" },
  email: "info@flexchicken.co.uk",
  address: {
    street: "107 Upminster Road South",
    locality: "Rainham",
    postcode: "RM13 9AA",
    short: "107 Upminster Rd S, Rainham RM13 9AA",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=107%20Upminster%20Rd%20S%2C%20Rainham%20RM13%209AA",
  },
  geo: { latitude: 51.518732, longitude: 0.193829 },
  hours: {
    display: "Daily, 12pm – 11pm",
    schedule: Object.fromEntries(
      ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => [
        day,
        ["12:00", "23:00"],
      ])
    ),
  },
  instagram: { handle: "@flexchickenrainham", url: "https://www.instagram.com/flexchickenrainham/" },
  justEat: {
    url: "https://www.just-eat.co.uk/restaurants-flex-chicken-rainham-rm13/menu",
    rating: 5,
    reviews: 9,
  },
  // The live site's claim. Its certificate page was empty: once the owner
  // sends the certificate, put it in public/ and set certificateUrl, and the
  // seal links to it. Until then nothing on the site says "certified".
  halal: { claim: "100% Halal", detail: "Prepared the Halal way", certificateUrl: null },
  // The owner's printed menu as a PDF (e.g. "/flex-chicken-menu.pdf" in
  // public/). Until it arrives, "Download menu" opens /full-menu, a printable
  // page built from the live menu that saves as a PDF.
  menuPdf: null,
  // A real photo of the shop front for About (e.g. "/shop/front.webp"); none yet.
  shopPhoto: null,
  loyalty: { stamps: 8, rewardVisit: 9 },
  // After a receipt stamp, the optional "How was your food?" (lib/review.js).
  // googleReviewUrl: Google Business Profile -> "Ask for reviews" -> copy the
  // link. Until the owner sends it, 4-5 stars open the shop on Google Maps.
  // whatsapp: the shop's WhatsApp number in international form, digits only
  // (e.g. "447700900123"); null hides the WhatsApp button.
  reviews: {
    googleReviewUrl: null,
    googleFallbackUrl: "https://www.google.com/maps/search/?api=1&query=Flex%20Chicken%20107%20Upminster%20Road%20South%20Rainham%20RM13%209AA",
    whatsapp: null,
    feedbackEmail: "info@flexchicken.co.uk",
  },
};
