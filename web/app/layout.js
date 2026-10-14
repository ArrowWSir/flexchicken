import { Montserrat, Poppins } from "next/font/google";
import "./globals.css";

// Montserrat is the typeface of the FLEX CHICKEN wordmark (bold FLEX,
// regular CHICKEN), so headings speak in the logo's voice. Poppins is the
// live site's body font.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["500", "700", "800", "900"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://flexchicken.uk";
const TITLE = "Flex Chicken | Rainham’s local chicken shop";
const DESCRIPTION =
  "Crispy fried chicken, loaded burgers and spicy wings from Flex Chicken, 107 Upminster Road South, Rainham. Collect stamps on your Flex card: 8 stamps, and your 9th visit brings a surprise.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Flex Chicken",
  appleWebApp: { capable: true, title: "Flex Chicken", statusBarStyle: "default" },
  icons: { icon: "/brand/icon-192.png", apple: "/brand/apple-touch-icon.png" },
  openGraph: {
    type: "website",
    siteName: "Flex Chicken",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_GB",
    images: [{ url: "/brand/logo-full.png", alt: "Flex Chicken" }],
  },
};

export const viewport = {
  themeColor: "#ecdecb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB" className={`${montserrat.variable} ${poppins.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
