"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { PwaInstallMenuAction } from "./pwa-install-menu-action";

export function SiteHeader({ inverse = false }: { inverse?: boolean }) {
  const mobileNavRef = useRef<HTMLDetailsElement>(null);
  const mobileNavSummaryRef = useRef<HTMLElement>(null);

  const closeMobileNav = () => {
    if (mobileNavRef.current) {
      mobileNavRef.current.open = false;
    }
  };

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const mobileNav = mobileNavRef.current;

      if (mobileNav?.open && event.target instanceof Node && !mobileNav.contains(event.target)) {
        mobileNav.open = false;
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mobileNavRef.current?.open) {
        mobileNavRef.current.open = false;
        mobileNavSummaryRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <header className={`site-header${inverse ? " site-header-inverse" : ""}`}>
      <Link className="brand-image" href="/" aria-label="Studio Balance – domovská stránka">
        <Image
          alt="Studio Balance"
          height={72}
          priority
          src="/images/studio-balance/brand-logo.jpg"
          width={120}
        />
      </Link>
      <nav aria-label="Hlavní navigace">
        <Link href="/o-studiu">O studiu</Link>
        <Link href="/lekce">Všechny lekce</Link>
        <Link href="/rozvrh">Rozvrh</Link>
        <Link href="/galerie">Galerie</Link>
        <Link href="/kontakt">Kontakt</Link>
      </nav>
      <div className="header-actions">
        <Link className="header-account" href="/muj-ucet">Můj účet</Link>
        <Link className="button button-small" href="/rozvrh">Rezervovat lekci</Link>
      </div>
      <details className="mobile-nav" ref={mobileNavRef}>
        <summary ref={mobileNavSummaryRef}><span className="mobile-nav-open-label">Menu</span><span className="mobile-nav-close-label">Zavřít</span></summary>
        <nav aria-label="Mobilní navigace" onClick={closeMobileNav}>
          <Link href="/o-studiu">O studiu</Link>
          <Link href="/lekce">Všechny lekce</Link>
          <Link href="/rozvrh">Rozvrh a rezervace</Link>
          <Link href="/promeny">Proměny</Link>
          <Link href="/galerie">Galerie</Link>
          <Link href="/cenik">Ceník</Link>
          <Link href="/kontakt">Kontakt</Link>
          <PwaInstallMenuAction />
          <Link className="mobile-nav-account" href="/muj-ucet">Přihlásit / Můj účet</Link>
        </nav>
      </details>
      <button
        aria-hidden="true"
        className="mobile-nav-backdrop"
        onClick={closeMobileNav}
        tabIndex={-1}
        type="button"
      />
    </header>
  );
}
