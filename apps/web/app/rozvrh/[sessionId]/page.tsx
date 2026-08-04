import type { Metadata } from "next";
import Link from "next/link";

import { SessionDetail } from "../../../components/session-detail";
import { SiteHeader } from "../../../components/site-header";

export const metadata: Metadata = { title: "Detail lekce" };

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <>
      <SiteHeader />
      <main className="detail-shell">
        <Link className="back-link" href="/rozvrh">Zpět na rozvrh</Link>
        <SessionDetail sessionId={sessionId} />
      </main>
    </>
  );
}
