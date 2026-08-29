# ADR 0010: Jednotné přihlášení administrátora s důkazem MFA

- Status: Accepted
- Datum: 2026-08-22
- Rozhodl: zadavatel Studio Balance
- Nahrazuje: ADR 0009 bod 5 a odpovídající část ADR 0004 bod 8

## Kontext

Administrátorka používá stejný klientský profil jako běžnou aplikaci. Původní
oddělení `sb_session` a `sb_admin_session` bezpečně vynucovalo TOTP, ale při
přechodu z profilu do správy zbytečně opakovalo heslo i OTP. Samotná admin role
v běžné relaci však není dostatečný důkaz, protože mohla být přiřazena až po
původním přihlášení pouze heslem.

## Rozhodnutí

1. Webový OIDC klient používá standardní Keycloak browser flow. Účet s
   nakonfigurovaným OTP při přihlášení dokončí heslo i OTP; běžný klient bez OTP
   dokončí pouze heslo.
2. Oba OIDC klienty publikují podepsaný standardní claim AMR. BFF nastaví
   `mfaVerified=true` pouze tehdy, když ověřený ID token obsahuje metodu `otp`.
3. Hodnota se uloží do serverové aplikační relace a následným refreshem se nikdy
   nepovýší. Později přidaná role proto nezmění relaci přihlášenou pouze heslem
   na administrátorskou.
4. `/admin` a admin API přijmou `sb_session` pouze při současném splnění aktuální
   role `admin` nebo `super_admin` a uloženého důkazu MFA. Chybějící důkaz vede
   na záložní přihlášení, nikoli k tichému povolení.
5. Oddělený klient `studiobalance-admin`, povinný password + TOTP flow a
   `sb_admin_session` zůstávají jako bezpečná záloha pro přímý vstup, obnovu a
   relaci vzniklou před zavedením AMR mapperu.
6. Doba relace, šifrovaný refresh token, 15minutová revalidace, 30denní idle a
   90denní absolutní maximum zůstávají podle ADR 0009.

## Důsledky

Administrátor zadá heslo a OTP jednou při přihlášení do aplikace a ze svého
profilu otevře správu bez dalšího formuláře. Klient bez admin role ani relace s
admin rolí bez prokázaného OTP správu neotevře. Produkční Keycloak musí mít u
obou klientů aktivní AMR mapper; dokud není nastaven, funguje bezpečná oddělená
záložní cesta.
