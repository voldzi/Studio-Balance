import Image from "next/image";
import Link from "next/link";

import { SiteHeader } from "../components/site-header";
import { LessonCatalog } from "../components/lesson-catalog";
import { ReviewsShowcase } from "../components/reviews-showcase";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <Image
            alt="Interiér Studia Balance s podložkami a cvičebními pomůckami"
            className="hero-image"
            fill
            loading="eager"
            priority
            sizes="(max-width: 760px) 100vw, 1180px"
            src="/images/studio-balance/studio-hero.jpg"
          />
          <div className="hero-overlay" />
          <div className="hero-copy">
            <p className="eyebrow eyebrow-light">Move · Flow · Balance</p>
            <h1 id="hero-title">Najdi si svůj balanc.</h1>
            <p className="hero-lead">Pohyb, síla a klid v komorním studiu s osobním přístupem.</p>
            <div className="actions">
              <Link className="button" href="/rozvrh">Rezervovat lekci</Link>
              <Link className="button button-ghost" href="#lekce">Prohlédnout lekce</Link>
            </div>
          </div>
        </section>

        <section className="story" id="studio" aria-labelledby="studio-title">
          <div className="story-copy">
            <p className="eyebrow">Studio Balance</p>
            <h2 id="studio-title">Místo, kde se spojuje pohyb, síla a klid.</h2>
            <p>
              Studio Balance je prostor, kde pečujeme o tělo i mysl. V jemné atmosféře,
              s osobním přístupem a důrazem na kvalitu pohybu.
            </p>
            <Link className="text-link" href="/o-studiu">Více o studiu</Link>
          </div>
          <div className="story-image-wrap">
            <Image
              alt="Teplý interiér Studia Balance"
              className="story-image"
              fill
              sizes="(max-width: 760px) 100vw, 55vw"
              src="/images/studio-balance/studio-detail.jpg"
            />
          </div>
        </section>

        <section className="lesson-section" id="lekce" aria-labelledby="lessons-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Lekce</p>
              <h2 id="lessons-title">Vyberte si svůj pohyb</h2>
            </div>
            <Link className="text-link" href="/lekce">Všechny lekce</Link>
          </div>
          <LessonCatalog compact />
        </section>

        <section className="flow-banner" aria-labelledby="flow-title">
          <Image
            alt="Klidný prostor Studia Balance"
            className="flow-image"
            fill
            sizes="1180px"
            src="/images/studio-balance/studio-hero.jpg"
          />
          <div className="flow-overlay" />
          <div className="flow-copy">
            <p className="eyebrow eyebrow-light">Balance Flow Method</p>
            <h2 id="flow-title">Plynulost, stabilita a rovnováha.</h2>
            <p>Autorská metoda pro vědomý pohyb bez tlaku na výkon.</p>
            <Link className="button button-ghost" href="/balance-flow">Poznat Balance Flow</Link>
          </div>
        </section>

        <ReviewsShowcase homepage />
      </main>

      <footer id="kontakt">
        <div className="footer-brand">
          <Image alt="Studio Balance" height={92} src="/images/studio-balance/brand-logo.jpg" width={154} />
          <p>Najdi si svůj balanc.</p>
        </div>
        <div>
          <h2>Kontakt</h2>
          <p>Ruská 10, 792 01 Bruntál</p>
          <Link href="/kontakt">Kontaktní informace</Link>
        </div>
        <div>
          <h2>Rezervace</h2>
          <Link href="/rozvrh">Rozvrh lekcí</Link>
          <Link href="/muj-ucet">Můj účet</Link>
        </div>
      </footer>
    </>
  );
}
