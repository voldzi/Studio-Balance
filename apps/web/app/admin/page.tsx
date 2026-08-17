import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminDashboard } from "../../components/admin-dashboard";
import { adminIdentityCookies, readWebSession } from "../../lib/identity";

export const metadata = { title: "Administrace" };

export default async function AdminPage() {
  const cookieStore = await cookies();
  const adminSession = await readWebSession(cookieStore.get(adminIdentityCookies.session)?.value, "admin");
  if (!adminSession) redirect("/admin/prihlaseni");
  if (!adminSession.roles.some((role) => role === "admin" || role === "super_admin")) redirect("/admin/prihlaseni?error=role");
  return <AdminDashboard email={adminSession.email} />;
}
