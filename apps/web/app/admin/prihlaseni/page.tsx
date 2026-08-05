import Link from "next/link";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="auth-page admin-auth-page"><Link className="brand" href="/">Studio Balance</Link><section className="auth-card" aria-labelledby="admin-login-title"><p className="eyebrow">Oddělený zabezpečený vstup</p><h1 id="admin-login-title">Administrace</h1><p>Přihlášení je určeno pouze provozovatelce a pověřeným administrátorům. Účet musí mít roli administrátora a nastavené vícefaktorové ověření.</p>{error && <p className="form-error" role="alert">Přihlášení se nepodařilo nebo účet nemá potřebné oprávnění.</p>}<Link className="button" href="/admin/auth/login?returnTo=/admin">Přihlásit se do administrace</Link><p className="auth-help">Klientský účet zde nelze použít.</p></section></main>;
}
