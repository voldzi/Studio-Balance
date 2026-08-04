import type { Metadata } from "next";

import { ScheduleView } from "../../components/schedule-view";
import { SiteHeader } from "../../components/site-header";

export const metadata: Metadata = {
  description: "Aktuální rozvrh lekcí Studia Balance bez zveřejňování kapacity.",
  title: "Rozvrh lekcí"
};

export default function SchedulePage() {
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
    </>
  );
}
