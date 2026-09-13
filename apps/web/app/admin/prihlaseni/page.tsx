import type { Metadata } from "next";
import Link from "next/link";

import { privatePageMetadata } from "../../../lib/seo";

export const metadata: Metadata = { ...privatePageMetadata, title: "Přihlášení do administrace" };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; requestId?: string }> }) {
  const { error, requestId } = await searchParams;
  const safeRequestId = requestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId) ? requestId : undefined;
  const errorMessage = error === "role"
    ? "Přihlášený účet nemá roli administrátora. Použijte účet určený pro správu studia."
    : error === "mfa"
      ? "Administrace vyžaduje ověřovací kód. Přihlaste se znovu a dokončete dvoufaktorové ověření."
      : error === "unavailable"
        ? `Přihlášení je teď dočasně nedostupné. Zkuste to prosím za chvíli znovu.${safeRequestId ? ` Kód pro podporu: ${safeRequestId}.` : ""}`
      : error
        ? "Přihlášení se nepodařilo dokončit. Zkuste jej znovu; pokud chyba trvá, předejte správci čas pokusu."
        : undefined;
  return <main className="auth-page admin-auth-page"><Link className="brand" href="/">Studio Balance</Link><section className="auth-card" aria-labelledby="admin-login-title"><p className="eyebrow">Oddělený zabezpečený vstup</p><h1 id="admin-login-title">Administrace</h1><p>Přihlášení je určeno pouze provozovatelce a pověřeným administrátorům. Účet musí mít roli administrátora a nastavené vícefaktorové ověření.</p>{errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}<form action="/admin/auth/login" method="get" className="auth-login-form"><input type="hidden" name="returnTo" value="/admin" /><label className="remember-device"><input type="checkbox" name="rememberDevice" value="1" /><span><strong>Zapamatovat toto soukromé zařízení na 90 dní</strong><small>Na sdíleném zařízení volbu nezaškrtávej.</small></span></label><button className="button" type="submit">Přihlásit se do administrace</button></form><p className="auth-help">Heslo a ověřovací kód se vyžadují při prvním přihlášení zařízení. Bez zaškrtnutí se správa zavře s prohlížečem.</p></section></main>;
}
