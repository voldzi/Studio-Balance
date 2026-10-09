import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AccountDashboard } from "../../components/account-dashboard";
import { accountLoginHref, accountView } from "../../lib/client-navigation";
import { identityCookies, readWebSession } from "../../lib/identity";
import { privatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = { ...privatePageMetadata, title: "Můj účet" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const { view } = await searchParams;
  const initialView = accountView(view);
  const cookieStore = await cookies();
  const session = await readWebSession(cookieStore.get(identityCookies.session)?.value);
  if (!session) redirect(accountLoginHref(initialView));

  return <AccountDashboard initialView={initialView} />;
}
