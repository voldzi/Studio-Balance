import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminDashboard } from "../../components/admin-dashboard";
import { adminIdentityCookies, identityCookies, readWebSession } from "../../lib/identity";

export const metadata = { title: "Administrace" };

export default async function AdminPage() {
  const cookieStore = await cookies();
  const adminSession = await readWebSession(cookieStore.get(adminIdentityCookies.session)?.value);
  const webSession = await readWebSession(cookieStore.get(identityCookies.session)?.value);
  const session = adminSession ?? webSession;
  if (!session) redirect("/admin/prihlaseni");
  if (!session.roles.some((role) => role === "admin" || role === "super_admin")) redirect("/admin/prihlaseni?error=role");
  return <AdminDashboard email={session.email} />;
}
