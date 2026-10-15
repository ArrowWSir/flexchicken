import AdminShell from "./AdminShell";
import { manifestUrl } from "../lib/apps";

export const metadata = { title: "Admin | Flex Chicken", manifest: manifestUrl("admin"), robots: { index: false, follow: false } };

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
