import type { Metadata } from "next";
import Link from "next/link";

import { RegistrationNotice } from "../../components/studio-status";
import { privatePageMetadata } from "../../lib/seo";

export const metadata: Metadata = { ...privatePageMetadata, title: "Přihlášení" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; requestId?: string; returnTo?: string }> }) {
  const { error, requestId, returnTo } = await searchParams;
  const safeReturnTo = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/muj-ucet";
  const safeRequestId = requestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId) ? requestId : undefined;
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
        {error === "unavailable" && <p className="form-error" role="alert">Přihlášení je teď dočasně nedostupné. Zkuste to prosím za chvíli znovu.{safeRequestId && <> Kód pro podporu: {safeRequestId}.</>}</p>}
        <form action="/auth/login" method="get" className="auth-login-form">
          <input type="hidden" name="returnTo" value={safeReturnTo} />
          <label className="remember-device">
            <input type="checkbox" name="rememberDevice" value="1" defaultChecked />
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
