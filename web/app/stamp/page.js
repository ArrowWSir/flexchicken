import { Suspense } from "react";
import AppShell from "../components/AppShell";
import SiteFooter from "../components/SiteFooter";
import StampClaim from "./StampClaim";

export const metadata = { title: "Your stamp | Flex Chicken", robots: { index: false } };

// Where the QR on a till receipt lands: the stamp goes on the card shown at
// the top, then an optional "How was your food?".
export default function StampPage() {
  return (
    <>
      <AppShell>
        {/* The code comes from the address, which is only known in the browser. */}
        <Suspense fallback={<div className="mx-auto mt-6 h-64 max-w-[440px] animate-pulse rounded-[24px] bg-surface" />}>
          <StampClaim />
        </Suspense>
      </AppShell>
      <SiteFooter />
    </>
  );
}
