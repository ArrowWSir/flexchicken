import DriverApp from "./DriverApp";
import { manifestUrl } from "../lib/apps";

export const metadata = { title: "Delivery | Flex Chicken", manifest: manifestUrl("driver"), robots: { index: false, follow: false } };

export default function DriverPage() {
  return <DriverApp />;
}
