import StaffScreen from "./StaffScreen";

export const metadata = { title: "Staff | Flex Chicken", robots: { index: false, follow: false } };

export default function StaffLayout({ children }) {
  return <StaffScreen>{children}</StaffScreen>;
}
