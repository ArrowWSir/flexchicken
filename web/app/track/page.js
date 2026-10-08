import { Suspense } from "react";
import AppShell from "../components/AppShell";
import SiteFooter from "../components/SiteFooter";
import TrackOrder from "./TrackOrder";

export const metadata = { title: "Track your order | Flex Chicken", robots: { index: false } };

export default function TrackPage() {
  return (
    <>
      <AppShell withCard={false}>
        {/* The order id comes from the address, which is only known in the browser. */}
        <Suspense fallback={<div className="mx-auto h-64 max-w-[560px] animate-pulse rounded-[24px] bg-surface" />}>
          <TrackOrder />
        </Suspense>
      </AppShell>
      <SiteFooter />
    </>
  );
}
