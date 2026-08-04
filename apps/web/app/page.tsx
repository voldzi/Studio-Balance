import Link from "next/link";

const lessonIdeas = [
  { name: "Pohyb", text: "Vědomá práce s tělem a technikou v klidném prostředí." },
  { name: "Síla", text: "Lekce, které respektují vaše tempo a podporují dlouhodobý rozvoj." },
  { name: "Rovnováha", text: "Čas pro sebe, soustředění a dobrý pocit z přirozeného pohybu." }
];

export default function HomePage() {
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Studio Balance – domovská stránka">
          <span>Studio</span> Balance
        </Link>
        <nav aria-label="Hlavní navigace">
          <Link href="#studio">O studiu</Link>
          <Link href="#lekce">Lekce</Link>
          <Link href="/rozvrh">Rozvrh</Link>
        </nav>
        <Link className="button button-small" href="/rozvrh">
          Rezervovat lekci
        </Link>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">Boutique pohybové studio</p>
            <h1 id="hero-title">Najdi si svůj balans.</h1>
            <p className="lead">
              Pohyb. Síla. Klid. Rovnováha. Prostor, kde můžete zpomalit,
              vnímat své tělo a odcházet s lehčí hlavou.
            </p>
            <div className="actions">
              <Link className="button" href="/rozvrh">
                Prohlédnout rozvrh
              </Link>
              <Link className="text-link" href="#studio">
                Poznat studio <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <span className="arc arc-one" />
            <span className="arc arc-two" />
            <span className="balance-mark">B</span>
          </div>
        </section>

        <section className="intro" id="studio" aria-labelledby="studio-title">
          <p className="eyebrow">Studio Balance</p>
          <h2 id="studio-title">Péče o tělo bez tlaku na výkon</h2>
          <p>
            Připravujeme přehledné místo pro výběr lekce a rezervaci. Konkrétní
            program, fotografie a příběh studia doplníme pouze ze schválených podkladů.
          </p>
        </section>

        <section className="lesson-section" id="lekce" aria-labelledby="lessons-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Co u nás najdete</p>
              <h2 id="lessons-title">Pohyb, který dává smysl</h2>
            </div>
            <Link className="text-link" href="/rozvrh">
              Otevřít rozvrh <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="lesson-grid">
            {lessonIdeas.map((lesson, index) => (
              <article className="lesson-card" key={lesson.name}>
                <span className="lesson-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <h3>{lesson.name}</h3>
                <p>{lesson.text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <p>Studio Balance</p>
        <p>Web je ve vývoji. Kontaktní údaje doplníme po potvrzení zadavatelem.</p>
      </footer>
    </>
  );
}
