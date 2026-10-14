import CardsDesk from "../../admin/cards/CardsDesk";

export const metadata = { title: "Cards | Flex Chicken staff" };

export default function StaffCardsPage() {
  return <CardsDesk isOwner={false} />;
}
