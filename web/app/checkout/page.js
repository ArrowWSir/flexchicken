import AppShell from "../components/AppShell";
import SiteFooter from "../components/SiteFooter";
import CheckoutFlow from "./CheckoutFlow";

export const metadata = { title: "Checkout | Flex Chicken", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <>
      <AppShell withCard={false}>
        <CheckoutFlow />
      </AppShell>
      <SiteFooter />
    </>
  );
}
