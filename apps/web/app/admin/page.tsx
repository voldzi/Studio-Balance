import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminDashboard } from "../../components/admin-dashboard";
import { adminIdentityCookies, identityCookies, readWebSession, type WebSession } from "../../lib/identity";
import { privatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = { ...privatePageMetadata, title: "Administrace" };

export default async function AdminPage() {
  const cookieStore = await cookies();
  const webSession = await readWebSession(cookieStore.get(identityCookies.session)?.value, "web");
  const separateAdminSession = isMfaAdministrator(webSession)
    ? undefined
    : await readWebSession(cookieStore.get(adminIdentityCookies.session)?.value, "admin");
  const session = isMfaAdministrator(webSession) ? webSession : separateAdminSession;
  if (!session) redirect("/admin/prihlaseni");
  if (!session.roles.some((role) => role === "admin" || role === "super_admin")) redirect("/admin/prihlaseni?error=role");
  if (!session.mfaVerified) redirect("/admin/prihlaseni?error=mfa");
  return <AdminDashboard email={session.email} />;
}

function isMfaAdministrator(session: WebSession | undefined): session is WebSession {
  return Boolean(session?.mfaVerified && session.roles.some((role) => role === "admin" || role === "super_admin"));
}
