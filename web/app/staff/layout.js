import StaffScreen from "./StaffScreen";
import { manifestUrl } from "../lib/apps";

export const metadata = { title: "Staff | Flex Chicken", manifest: manifestUrl("staff"), robots: { index: false, follow: false } };

export default function StaffLayout({ children }) {
  return <StaffScreen>{children}</StaffScreen>;
}
