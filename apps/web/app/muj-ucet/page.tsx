import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { identityCookies, readWebSession } from "../../lib/identity";

export default async function AccountPage() {
  const cookieStore = await cookies();
  const session = await readWebSession(cookieStore.get(identityCookies.session)?.value);
  if (!session) redirect("/prihlaseni?returnTo=/muj-ucet");

  return (
    <main className="account-page">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Studio Balance – domovská stránka">
          <span>Studio</span> Balance
        </Link>
        <form action="/auth/logout" method="post">
          <button className="button button-small" type="submit">
            Odhlásit se
          </button>
        </form>
      </header>
      <section className="account-card" aria-labelledby="account-title">
        <p className="eyebrow">Můj účet</p>
        <h1 id="account-title">Vítejte</h1>
        <p>{session.email}</p>
        {session.emailVerified ? (
          <p className="status-success">E-mail je ověřený. Rezervace budou dostupné po nasazení rozvrhu.</p>
        ) : (
          <p className="status-warning">Před první rezervací je potřeba ověřit e-mail v účtu Studio Balance.</p>
        )}
        <Link className="text-link" href="/rozvrh">
          Zpět na rozvrh <span aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}
