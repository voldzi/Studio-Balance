# Nginx publikace Studio Balance

Izolovaný preview na `docker.home.cz` používá web port 3280 a API port 4280;
ověřený produkční kandidát používá porty 3281 a 4281. Instalační skript je určený pro Debian/Ubuntu Nginx host
`dmz.home.cz`. Neobsahuje credentials a publikuje kanonický web
`studio-balance.cz`, redirect z `www`, realm přes
`login.studio-balance.cz` a pouze produktové `/api/`; interní API
`/health` a `/ready` blokuje na veřejném virtual hostu. Konfigurace Studio
Balance nevytváří ani nevyžaduje hostname na `zeleznalady.cz`.

## Jednorázové udělení správcovského přístupu

Z připravené lokální administrátorské stanice spusťte:

```bash
bash scripts/grant-dmz-codex-access.sh
```

Pokud DMZ používá jiný stávající klíč, předejte ho explicitně:

```bash
bash scripts/grant-dmz-codex-access.sh --identity ~/.ssh/EXISTUJICI_KLIC
```

Skript interaktivně využije váš současný SSH a sudo přístup, přenese oba
ověřené pomocné soubory na DMZ a okamžitě otestuje nový omezený přístup. Pokud
je nutné provést bootstrap přímo na serveru, přeneste celý obsah této složky a
v existující administrátorské relaci spusťte:

```bash
sudo bash bootstrap-codex-dmz-access.sh
```

Bootstrap přidá vyhrazený omezený veřejný klíč s fingerprintem
`SHA256:B9q6yLIlqgOPxY9mwnAvDCmmfks17CuMTJy471Brcwg`. Sudo bez hesla povolí pouze
rootem vlastněný a SHA-256 ověřený příkaz
`/usr/local/sbin/studiobalance-install-nginx`; nedává obecné root oprávnění.
Soukromý klíč zůstává jen na vývojovém počítači.

Přístup lze po dokončení odvolat stejným souborem:

```bash
sudo bash bootstrap-codex-dmz-access.sh --revoke
```

Na `dmz.home.cz` zkopírujte skript a spusťte:

```bash
chmod +x install-studiobalance.sh
sudo ./install-studiobalance.sh --activate-preview --email ADMIN_EMAIL
```

Přepnutí na již ověřený produkční kandidát vyžaduje také přesnou revizi:

```bash
sudo ./install-studiobalance.sh --activate-production \
  --expected-version GIT_SHA --email ADMIN_EMAIL
```

`ADMIN_EMAIL` nahraďte skutečným provozním kontaktem pro Let's Encrypt. Skript:

1. ověří IPv4 DNS všech tří nových hostnames, web/API/Keycloak upstreamy a u produkce přesnou očekávanou revizi;
2. zazálohuje případnou předchozí konfiguraci;
3. nainstaluje HTTP virtual host a provede `nginx -t`;
4. získá nebo znovu použije Let's Encrypt certifikát pro root, `www` a `login`;
5. vytvoří HTTPS konfiguraci, reloaduje Nginx a ověří načtení virtual hostu;
6. při chybě obnoví předchozí Nginx konfiguraci.

Volba `--http-only` je určena pouze pro diagnostiku challenge/routingu. Běžná
publikace musí používat HTTPS. Preview volba používá izolovanou databázi;
produkční volba smí být použita až po samostatném ověření kandidáta na portech
3281/4281.

Aktivace 2026-08-04 ověřila redirect HTTP → HTTPS, webovou odpověď 200,
Let's Encrypt certifikát a veřejné blokování `/health` a `/ready`.

## Úzká aktualizace existující produkční konfigurace

Pro již publikovanou produkci použijte `harden-studiobalance.py`. Aktuální
`sites-enabled/studio-balance.cz.conf` může být samostatný soubor, který se od
`sites-available` liší. Nespouštějte proto kvůli dvěma novým proxy pravidlům
znovu celý instalátor a neměňte soubor automaticky na symlink. Nástroj
podporuje oba režimy, zachová zapojení a každý samostatný soubor upraví zvlášť.

Po úspěšném aplikačním rollout a ověření přesné revize přeneste pouze nástroj
z příslušného čistého commitu na DMZ do soukromého pracovního adresáře.
Porovnejte jeho SHA-256 na zdrojové i cílové stanici. Na Linux DMZ spusťte:

```bash
sudo -n python3 /CESTA/harden-studiobalance.py --expected-version GIT_SHA
sudo -n python3 /CESTA/harden-studiobalance.py --expected-version GIT_SHA --apply
```

První příkaz je výchozí read-only kontrola. Ověří IPv4 DNS všech tří veřejných
hostnames a Docker hostitele, webový a Keycloak HEAD s HTTP 200, API readiness
`status=ok` s **celou přesnou** očekávanou revizí a stávající `nginx -t`.
Neprovádí zápis, nezakládá zálohy ani zámek a nere-loaduje Nginx. Výstup
obsahuje pouze cesty, změnový plán a kontrolní součty; analytics tajemství
ani celá konfigurace se nevypisují.

`--apply` vyžaduje root a aplikační zámek. Před výměnou ověří stav znovu,
vytvoří ověřené kopie **obou** app konfigurací v soukromém adresáři
`/var/backups/studiobalance-nginx/<UTC>-<revize>/` a uloží `manifest.json`.
Zachová vlastníky, režimy, případný symlink a Linux extended attributes.
Tajný analytics include se nezálohuje ani nepřepisuje; sleduje se jeho hash.
Pro každou výměnu kontroluje hash a metadata proti výchozímu stavu a proti
již provedeným vlastním změnám. Dočasný soubor má stejného vlastníka/režim,
je synchronizován na disk a nahrazen atomickým přejmenováním.

Mění pouze dva bloky kanonického HTTPS serveru:

- exact `/api/internal` a prefix `/api/internal/` vracejí 404;
- `/api/` má `gzip off`, pouze vnořená exact `/api/v1/sessions` zapíná gzip
  pro JSON od 1024 bajtů s `Vary: Accept-Encoding`.

Ostatní bajty zůstanou zachované: TLS, doménová přesměrování, Keycloak proxy,
security headers, timeouty i schválený analytics include. Je vyžadována
současná důvěryhodná hlavička `X-Forwarded-For $remote_addr`; nový hlavní
instalátor zachovává stejnou hranici a nepřebírá klientem podvržený řetězec IP.
Neznámá, částečně upravená nebo duplicitní pravidla způsobí odmítnutí; nástroj
je neopravuje podle domněnek. Úspěšné opakování nemění žádnou konfiguraci ani
nespouští reload. Nástroj nikdy nevolá certbot a nevypisuje `nginx -T`.

Po změně musí projít `nginx -t`, reload a opakované přesné ověření upstreamů.
Při selhání nebo přerušení nástroj obnoví pouze své vlastní změny, znovu ověří
syntax a načte původní konfiguraci. Pokud mezitím zasáhl jiný správce nebo se
změnil analytics include, nepřepíše cizí změnu a výslovně vyžaduje ruční
kontrolu; stav se nesmí označit za dokončený.

Po dokončení zkontrolujte HTTPS web, canonical `www`, přihlášení, `/health`,
`/ready` a obě interní API varianty s 404. Ověřte `Content-Encoding: gzip`
jen pro veřejný rozvrh, pokud tělo překračuje limit, a zachování analytics
hash/privátních cest bez událostí. Ověření přihlášeného účtu zůstává oddělenou
akceptační kontrolou; readiness ho nenahrazuje.

### Ruční rollback

Konkrétní záložní adresář vypíše aplikace nástroje. `manifest.json` přiřazuje
každou zálohu původní cestě a uvádí SHA-256 i druh souboru. Před ruční obnovou
ověřte, zda od nasazení neproběhla další legitimní změna, a obnovujte pouze
tyto dvě app cesty pomocí metadata zachovávající kopie; u běžného symlinku
zůstává aktivní odkaz zachovaný. Nepoužívejte globální obnovení `/etc/nginx`.
Po obnovení vždy proveďte `sudo nginx -t` a až po úspěchu
`sudo systemctl reload nginx`, potom HTTPS a upstream kontrolu původní revize.
Pokud původní revizi neposkytuje aplikace, její rollback proveďte odděleným
aplikačním postupem.

Regresní gate tohoto nástroje je `python3 infra/nginx/test-hardening.py`.
Používá pouze soukromé fixture adresáře a mockované služby, žádnou produkční
konfiguraci ani síť. Kontroluje minimální změnu bajtů, idempotenci, oba režimy
sites-enabled, metadata a integritu kopií, readiness revize, nebezpečné a
částečné konfigurace, souběh, chyby syntaxe/reloadu a bezpečný rollback.
