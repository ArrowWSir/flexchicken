import AppShell from "../components/AppShell";
import SiteFooter from "../components/SiteFooter";
import AccountView from "./AccountView";

export const metadata = { title: "Your account | Flex Chicken", robots: { index: false } };

export default function AccountPage() {
  return (
    <>
      <AppShell withCard={false}>
        <AccountView />
      </AppShell>
      <SiteFooter />
    </>
  );
}
