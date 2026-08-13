import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ClientRouteNavigation } from "../../components/client-route-navigation";
import { ScheduleView } from "../../components/schedule-view";
import { SiteHeader } from "../../components/site-header";
import { identityCookies, readWebSession } from "../../lib/identity";

export const metadata: Metadata = {
  description: "Aktuální rozvrh lekcí Studia Balance bez zveřejňování kapacity.",
  title: "Rozvrh lekcí"
};

export default async function SchedulePage() {
  const cookieStore = await cookies();
  const session = await readWebSession(cookieStore.get(identityCookies.session)?.value);
  return (
    <>
      <SiteHeader />
      <main className="schedule-shell">
        <header className="page-heading">
          <p className="eyebrow">Rezervace</p>
          <h1>Rozvrh lekcí</h1>
          <p>Vyberte si lekci a své místo. Přehled rozvrhu můžete procházet bez přihlášení.</p>
        </header>
        <ScheduleView />
      </main>
      {session && <ClientRouteNavigation active="schedule" />}
    </>
  );
}
