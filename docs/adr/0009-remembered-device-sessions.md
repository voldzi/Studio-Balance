# ADR 0009: Serverová relace zapamatovaného zařízení

- Status: Accepted; bod 5 je nahrazen ADR 0010
- Datum: 2026-08-17
- Rozhodl: zadavatel Studio Balance

## Kontext

Studio používá Keycloak a oddělený OIDC klient pro administraci s povinným
TOTP. Dřívější osmihodinová aplikační relace a bezpodmínečné vynucení
`prompt=login` při každém administračním vstupu byly zbytečně rušivé. Současně
nelze považovat běžnou klientskou relaci s rolí `admin` za důkaz, že uživatel
právě dokončil druhý faktor.

## Rozhodnutí

1. Browser dostane jen náhodný, neprůhledný token v `HttpOnly`, `Secure` a
   `SameSite=Lax` cookie `sb_session` nebo `sb_admin_session`. Token neobsahuje
   OIDC identity, roli ani obnovovací token; databáze ukládá pouze jeho SHA-256
   hash.
2. Po OIDC callbacku BFF předá refresh token interním HMAC chráněným voláním
   API. API ho uloží zašifrovaný AES-256-GCM klíčem odvozeným HKDF z
   `SESSION_SECRET`. Browser JavaScript OIDC token nikdy nedostane.
3. Bez aplikací nabízené volby „Zapamatovat toto soukromé zařízení na 90 dní“
   je cookie session-only a po zavření browseru zaniká. Se zvolenou volbou má
   cookie absolutní maximum 90 dní. Server při každém použití prodlouží aktivní
   relaci nanejvýš na 30 dní neaktivity, nikdy za její 90denní strop.
4. API znovu ověří refresh token, subject, aktivitu účtu a realm role v
   Keycloaku nejpozději po 15 minutách od minulé revalidace. Chyba refreshu,
   disabled účet, změněný subject nebo odebraná admin role relaci zneplatní.
5. Nahrazeno ADR 0010: admin API může přijmout i `sb_session`, ale výhradně když
   server při původním interaktivním přihlášení uložil podepsaný AMR důkaz OTP.
   Oddělená `sb_admin_session` zůstává záložní cestou.
6. Keycloak `Remember me` je vypnuté, aby uživatel neviděl konkurenční volbu.
   SSO a client session mají 30denní idle a 90denní maximum, aby mohl server
   po dobu důvěryhodné relace bezpečně používat refresh token.
7. Explicitní odhlášení zneplatní serverový záznam, odstraní jeho šifrovaný
   refresh token, pokusí se jej revokovat u Keycloaku a smaže obě aplikační
   cookies na aktuálním zařízení.

## Důsledky

Klient se na osobním telefonu či počítači nemusí při každé návštěvě znovu
přihlašovat; na sdíleném zařízení volbu nezaškrtne a relace skončí zavřením
browseru. Administrátor zadá heslo a ověřovací kód při prvním vstupu důvěryhodného
zařízení nebo po zániku relace, ne při každém běžném přechodu mezi klientským
profilem a správou.

Každé nasazení tohoto rozhodnutí zneplatní dřívější JWT browser relace, takže
se uživatelé jednou přihlásí znovu. Pro ztracené zařízení je nejrychlejší
explicitní odhlášení, změna hesla nebo zneplatnění Keycloak relací; po nejvýše
15 minutách se změna projeví i v aktivní aplikaci.
