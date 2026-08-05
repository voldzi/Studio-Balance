import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminDashboard } from "../../components/admin-dashboard";
import { adminIdentityCookies, readWebSession } from "../../lib/identity";

export const metadata = { title: "Administrace" };

export default async function AdminPage() {
  const cookieStore = await cookies();
  const session = await readWebSession(cookieStore.get(adminIdentityCookies.session)?.value);
  if (!session) redirect("/admin/prihlaseni");
  if (!session.roles.some((role) => role === "admin" || role === "super_admin")) redirect("/admin/prihlaseni?error=role");
  return <AdminDashboard email={session.email} />;
}
