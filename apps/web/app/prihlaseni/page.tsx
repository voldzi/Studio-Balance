import type { Metadata } from "next";
import Link from "next/link";

import { RegistrationNotice } from "../../components/studio-status";
import { privatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = { ...privatePageMetadata, title: "Přihlášení" };

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
          Přihlášení bezpečně zajišťuje Studio Balance účet. Po přihlášení se vrátíte tam,
          kde jste skončili.
        </p>
        <form action="/auth/login" method="get" className="auth-login-form">
          <input type="hidden" name="returnTo" value={safeReturnTo} />
          <label className="remember-device">
            <input type="checkbox" name="rememberDevice" value="1" />
            <span><strong>Zapamatovat toto soukromé zařízení na 90 dní</strong><small>Na sdíleném telefonu nebo počítači volbu nezaškrtávej.</small></span>
          </label>
          <button className="button" type="submit">Pokračovat k přihlášení</button>
        </form>
        <p className="auth-help">Bez zaškrtnutí zůstane přihlášení jen do zavření prohlížeče.</p>
      <RegistrationNotice />
      </section>
    </main>
  );
}
