import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  description: "Připravovaný rozvrh lekcí Studia Balance.",
  title: "Rozvrh"
};

export default function SchedulePage() {
  return (
    <main className="schedule-shell">
      <Link className="brand" href="/">
        <span>Studio</span> Balance
      </Link>
      <section className="schedule-empty" aria-labelledby="schedule-title">
        <p className="eyebrow">Rozvrh</p>
        <h1 id="schedule-title">Rozvrh právě připravujeme</h1>
        <p>
          Termíny budou dostupné bez přihlášení. Jakmile budou data potvrzená,
          zobrazí se zde přehled po dnech s jasným stavem každé lekce.
        </p>
        <Link className="button" href="/">
          Zpět na úvod
        </Link>
      </section>
    </main>
  );
}
