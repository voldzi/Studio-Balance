import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ClientRouteNavigation } from "../../components/client-route-navigation";
import { ScheduleView } from "../../components/schedule-view";
import { SiteHeader } from "../../components/site-header";
import { identityCookies, readWebSession } from "../../lib/identity";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({ path: "/rozvrh", title: "Rozvrh lekcí a rezervace", description: "Aktuální rozvrh lekcí Studia Balance v Bruntále. Prohlédněte si termíny, ceny a rezervujte si vybranou lekci online." });

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
