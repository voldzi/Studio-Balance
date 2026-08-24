import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AccountDashboard } from "../../components/account-dashboard";
import { identityCookies, readWebSession } from "../../lib/identity";
import { privatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = { ...privatePageMetadata, title: "Můj účet" };

export default async function AccountPage() {
  const cookieStore = await cookies();
  const session = await readWebSession(cookieStore.get(identityCookies.session)?.value);
  if (!session) redirect("/prihlaseni?returnTo=/muj-ucet");

  return <AccountDashboard />;
}
