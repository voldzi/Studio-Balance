# ADR 0031 — Obnova hesla a dočasná ochrana přihlášení

Datum: 2026-10-15. Stav: schválené rozhodnutí, produkční aktivace je samostatný krok.
Navazuje na CD-073 a doplňuje ADR 0004; nemění registraci ani administrátorské MFA.

## Kontext

Při zapomenutém hesle už existující účet nelze založit znovu. Vypnutý reset
bez SMTP proto vytváří slepou uličku. Provozní kontrola současně potvrdila,
že realm nemá aktivní vestavěnou ochranu proti opakovaným pokusům.
Výchozí Keycloak reset credentials navíc může obnovit OTP a po odkazu
automaticky vytvořit přihlášenou relaci; takové chování není přijatelné.

## Rozhodnutí

- Hesla nadále zpracovává pouze Keycloak. Nevzniká vlastní REST endpoint,
  nová databázová tabulka, generování hesel ani širší servisní oprávnění.
- Samostatný `studio-balance-password-recovery` flow používá právě
  `reset-credentials-choose-user`, `reset-credential-email` a `reset-password`,
  vše `REQUIRED`. E-mailový krok má `force-login=true`. OTP se nemění.
- Reset je povolený až po samostatném ověření doručení přes schválené SMTP.
  Veřejné SMTP vyžaduje TLS a autentizaci; privátní relay musí být výslovně
  schválený. Přihlašovací údaje zůstávají mimo Git, prohlížeč a chat.
- Platnost uživatelského reset odkazu je 900 sekund; token je jednorázový.
  Registrace nevyžaduje ověření e-mailu a tato změna nepovoluje rezervační outbox.
- Realm používá dočasnou ochranu: 5 chyb, základ 60 sekund, maximum 900 sekund,
  reset čítače 1800 sekund. Trvalá primární ani sekundární blokace se nezapíná.
- Nápověda je vložená přes oficiální Keycloak `footer.ftl` hook. Formuláře,
  zpracování hesel a MFA zůstávají zděděné. Odkaz na reset je podmíněný skutečným
  `resetPasswordAllowed`; odeslání má neutrální text také pro neznámý účet.
- Dedicated login host nesmí logovat query, Referer, cookies ani těla formulářů.
  Používá `no-referrer`. Tokeny se neexportují do důkazů či snímků obrazovky.
- Téma se publikuje do nové verzované složky a přepne pouze na tomto realmu;
  neprovádí se restart sdíleného Keycloaku.

## Provoz a návrat

Konfigurátor ukládá soukromý snapshot měněných hodnot a umí jejich návrat.
Samostatný režim ochrany přihlášení nevyžaduje SMTP a nepovolí reset.
Změna existujícího SMTP musí mít úplný podklad pro rollback, nikoli maskované
heslo získané z Admin API. Flow a nové téma zůstanou po návratu neaktivní,
aby se nepoškodila již otevřená stránka. Původní téma a vazby zůstávají zachované.

## Ověření

Na izolovaném Keycloak 26.8.0: skutečný tok obnovy přes testovací schránku,
neznámý e-mail, změna hesla, odmítnutí starého hesla/použitého a prošlého
odkazu, dočasná blokace a zachování OTP administrátora. Odděleně se ověřuje
mobilní a desktopová nápověda, bezpečné DMZ logování a produkční doručení.
Účet skutečné klientky se nevydává za obnovený, dokud reset sama nedokončí.

Omezení četnosti na dedicated login hostu se týká pouze POST formulářů
`/realms/studio-balance/login-actions/`: průměr 10 za minutu na IP, krátká
špička 20 požadavků navíc. GET, zdroje tématu, token refresh a ostatní realmy
se neomezují tímto pravidlem. Překročení vrací srozumitelnou chybu 429
a `Retry-After: 60`; chrání také obnovu před zneužitím k rozesílání zpráv.
