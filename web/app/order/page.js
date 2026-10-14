import AppShell from "../components/AppShell";
import SiteFooter from "../components/SiteFooter";
import OrderMenu from "./OrderMenu";

export const metadata = {
  title: "Full menu | Flex Chicken",
  description: "Every Flex Chicken dish in one list: pick as many as you like and add them all to your Box.",
};

export default function OrderPage() {
  return (
    <>
      <AppShell withCard={false}>
        <OrderMenu />
      </AppShell>
      <SiteFooter />
    </>
  );
}
