import AdminShell from "./AdminShell";

export const metadata = { title: "Admin | Flex Chicken", robots: { index: false, follow: false } };

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
