import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { ClientRouteNavigation } from "../../../components/client-route-navigation";
import { SessionDetail } from "../../../components/session-detail";
import { SiteHeader } from "../../../components/site-header";
import { identityCookies, readWebSession } from "../../../lib/identity";
import { privatePageMetadata } from "../../../lib/seo";

export const metadata: Metadata = { ...privatePageMetadata, title: "Detail termínu" };

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const cookieStore = await cookies();
  const session = await readWebSession(cookieStore.get(identityCookies.session)?.value);
  return (
    <>
      <SiteHeader />
      <main className="detail-shell">
        <Link className="back-link" href="/rozvrh">Zpět na rozvrh</Link>
        <SessionDetail sessionId={sessionId} />
      </main>
      {session && <ClientRouteNavigation active="schedule" />}
    </>
  );
}
