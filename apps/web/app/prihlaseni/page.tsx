import Link from "next/link";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  const safeReturnTo = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/muj-ucet";
  return (
    <main className="auth-page">
      <Link className="brand" href="/" aria-label="Studio Balance – domovská stránka">
        <span>Studio</span> Balance
      </Link>
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">Klientský účet</p>
        <h1 id="login-title">Přihlásit se</h1>
        <p>
          Přihlášení a registraci bezpečně zajišťuje Studio Balance účet. Po přihlášení se vrátíte tam,
          kde jste skončili.
        </p>
        <Link className="button" href={`/auth/login?returnTo=${encodeURIComponent(safeReturnTo)}`}>
          Pokračovat k přihlášení
        </Link>
        <p className="auth-help">Nový účet vytvoříte v následujícím bezpečném kroku.</p>
      </section>
    </main>
  );
}
