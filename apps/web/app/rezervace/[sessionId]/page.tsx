import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { BookingFlow } from "../../../components/booking-flow";
import { ClientRouteNavigation } from "../../../components/client-route-navigation";
import { SiteHeader } from "../../../components/site-header";
import { identityCookies, readWebSession } from "../../../lib/identity";
import { privatePageMetadata } from "../../../lib/seo";

export const metadata: Metadata = { ...privatePageMetadata, title: "Rezervace lekce" };

export default async function BookingPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const cookieStore = await cookies();
  const session = await readWebSession(cookieStore.get(identityCookies.session)?.value);
  if (!session) redirect(`/prihlaseni?returnTo=${encodeURIComponent(`/rezervace/${sessionId}`)}`);

  return (
    <>
      <SiteHeader />
      <main className="booking-shell"><BookingFlow sessionId={sessionId} /></main>
      <ClientRouteNavigation active="none" />
    </>
  );
}
