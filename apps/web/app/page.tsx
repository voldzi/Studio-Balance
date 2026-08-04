import Image from "next/image";
import Link from "next/link";

import { SiteHeader } from "../components/site-header";

const lessons = [
  { name: "Barre", tagline: "Tvarování, postava a elegance", image: "studio-detail.jpg", position: "50% 48%" },
  { name: "TRX", tagline: "Funkční síla a kontrola", image: "studio-hero.jpg", position: "12% 48%" },
  { name: "Balance Flow", tagline: "Stabilita, mobilita a plynulý pohyb", image: "studio-detail.jpg", position: "78% 55%" },
  { name: "Jumping", tagline: "Zábava, kardio a energie", image: "studio-hero.jpg", position: "90% 40%" },
  { name: "Power jóga", tagline: "Síla, dech a vnitřní klid", image: "studio-detail.jpg", position: "25% 72%" },
  { name: "Kruhový trénink", tagline: "Komplexní trénink celého těla", image: "studio-hero.jpg", position: "55% 65%" }
];

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
            <h1 id="hero-title">Najdi si svůj balans.</h1>
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
            <Link className="text-link" href="/rozvrh">Najít svoji lekci</Link>
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
            <Link className="text-link" href="/rozvrh">Celý rozvrh</Link>
          </div>
          <div className="lesson-grid">
            {lessons.map((lesson) => (
              <article className="lesson-card" key={lesson.name}>
                <div className="lesson-image-wrap">
                  <Image
                    alt="Interiér Studia Balance"
                    className="lesson-image"
                    fill
                    sizes="(max-width: 620px) 100vw, (max-width: 960px) 50vw, 33vw"
                    src={`/images/studio-balance/${lesson.image}`}
                    style={{ objectPosition: lesson.position }}
                  />
                </div>
                <div className="lesson-copy">
                  <h3>{lesson.name}</h3>
                  <p>{lesson.tagline}</p>
                </div>
              </article>
            ))}
          </div>
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
            <Link className="button button-ghost" href="/rozvrh">Vybrat termín</Link>
          </div>
        </section>
      </main>

      <footer id="kontakt">
        <div className="footer-brand">
          <Image alt="Studio Balance" height={92} src="/images/studio-balance/brand-logo.jpg" width={154} />
          <p>Najdi si svůj balans.</p>
        </div>
        <div>
          <h2>Kontakt</h2>
          <p>Ruská 10, 792 01 Bruntál</p>
          <p>732 192 120</p>
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
