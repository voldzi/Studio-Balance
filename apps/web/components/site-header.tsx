import Image from "next/image";
import Link from "next/link";

export function SiteHeader({ inverse = false }: { inverse?: boolean }) {
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
      <details className="mobile-nav">
        <summary><span className="mobile-nav-open-label">Menu</span><span className="mobile-nav-close-label">Zavřít</span></summary>
        <nav aria-label="Mobilní navigace">
          <Link href="/o-studiu">O studiu</Link>
          <Link href="/lekce">Všechny lekce</Link>
          <Link href="/rozvrh">Rozvrh a rezervace</Link>
          <Link href="/balance-flow">Metoda Balance Flow</Link>
          <Link href="/promeny">Proměny</Link>
          <Link href="/galerie">Galerie</Link>
          <Link href="/cenik">Ceník</Link>
          <Link href="/kontakt">Kontakt</Link>
          <Link className="mobile-nav-account" href="/muj-ucet">Přihlásit / Můj účet</Link>
        </nav>
      </details>
    </header>
  );
}
