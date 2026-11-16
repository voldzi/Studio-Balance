import { WebsiteCoverPhoto } from "../components/website-cover-photo";
import { readStudioWebsitePhotos } from "../lib/read-studio-website-photos";
import { ScheduleCallToAction } from "../components/studio-status";
import { Fragment } from "react";
import { homepageSections } from "@studiobalance/domain";
import { StudioBrandLogo } from "../components/studio-brand";
import Link from "next/link";
import type { Metadata } from "next";

import { SiteHeader } from "../components/site-header";
import { CreatorCredits } from "../components/site-footer";
import { LessonCatalog } from "../components/lesson-catalog";
import { MassagePartnerSection } from "../components/massage-partner-section";
import { ReviewsShowcase } from "../components/reviews-showcase";
import { SocialLinks } from "../components/social-links";
import { StructuredData } from "../components/structured-data";
import { TransformationsShowcase } from "../components/transformations-showcase";
import { homeMetadata, studioStructuredData } from "../lib/seo";

export const metadata: Metadata = homeMetadata;

export default async function HomePage() {
  const photos = await readStudioWebsitePhotos();
  const appearance = photos?.appearance;
  const sections = {
    studio: <section className="story" id="studio" aria-labelledby="studio-title">
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
        <WebsiteCoverPhoto className="story-image" photo={appearance?.story} fallback={{
          src: "/images/studio-balance/studio-detail.jpg", alt: "Teplý interiér Studia Balance"
        }} sizes="(max-width: 760px) 100vw, 55vw" priority={false} />
      </div>
    </section>,

    lessons: <section className="lesson-section" id="lekce" aria-labelledby="lessons-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Lekce</p>
          <h2 id="lessons-title">Vyberte si svůj pohyb</h2>
        </div>
        <Link className="text-link" href="/lekce">Všechny lekce</Link>
      </div>
      <LessonCatalog compact />
    </section>,

    flow: <section className="flow-banner" aria-labelledby="flow-title">
      <WebsiteCoverPhoto className="flow-image" photo={appearance?.flow} fallback={{
        src: "/images/studio-balance/studio-hero.jpg", alt: "Klidný prostor Studia Balance"
      }} sizes="1180px" priority={false} />
      <div className="flow-overlay" />
      <div className="flow-copy">
        <p className="eyebrow eyebrow-light">Balance Flow Method</p>
        <h2 id="flow-title">Plynulost, stabilita a rovnováha.</h2>
        <p>Autorská metoda pro vědomý pohyb bez tlaku na výkon.</p>
        <Link className="button button-ghost" href="/balance-flow">Poznat Balance Flow</Link>
      </div>
    </section>,

    transformations: <TransformationsShowcase homepage />,
    reviews: <ReviewsShowcase homepage />,
    massage: <MassagePartnerSection />
  };
  return (
    <>
      <StructuredData data={studioStructuredData()} />
      <SiteHeader />
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <WebsiteCoverPhoto className="hero-image" photo={photos?.home} fallback={{
            src: "/images/studio-balance/studio-hero.jpg", alt: "Interiér Studia Balance s podložkami a cvičebními pomůckami"
          }} />
          <div className="hero-overlay" />
          <div className="hero-copy">
            <p className="eyebrow eyebrow-light">Move · Flow · Balance</p>
            <h1 id="hero-title">Najdi si svůj balanc.</h1>
            <p className="hero-lead">Pohyb, síla a klid v komorním studiu s osobním přístupem.</p>
            <div className="actions">
              <ScheduleCallToAction />
              <Link className="button button-ghost" href="#lekce">Prohlédnout lekce</Link>
            </div>
          </div>
        </section>
        {(appearance?.sectionOrder ?? homepageSections).map((id) => <Fragment key={id}>{sections[id]}</Fragment>)}
      </main>

      <footer id="kontakt" className="site-footer">
        <div className="footer-brand">
          <StudioBrandLogo />
          <p>Najdi si svůj balanc.</p>
        </div>
        <div>
          <h2>Kontakt</h2>
          <p>Ruská 10, 792 01 Bruntál</p>
          <Link href="/kontakt">Kontaktní informace</Link>
          <SocialLinks compact />
        </div>
        <div>
          <h2>Rezervace</h2>
          <Link href="/rozvrh">Rozvrh lekcí</Link>
          <Link href="/muj-ucet">Můj účet</Link>
        </div>
        <CreatorCredits />
      </footer>
    </>
  );
}
