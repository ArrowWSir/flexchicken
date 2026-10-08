import ShopSettings from "./ShopSettings";

export const metadata = { title: "Shop & delivery | Flex Chicken admin" };

export default function AdminShopPage() {
  return (
    <div className="grid grid-cols-1 gap-5">
      <h1 className="font-display text-[24px] font-black uppercase leading-none">Shop & delivery</h1>
      <ShopSettings />
    </div>
  );
}
