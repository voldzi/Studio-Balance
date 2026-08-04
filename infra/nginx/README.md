# Nginx publikace Studio Balance

Izolovaný preview na `docker.home.cz` používá web port 3280 a API port 4280;
ověřený produkční kandidát používá porty 3281 a 4281. Instalační skript je určený pro Debian/Ubuntu Nginx host
`dmz.home.cz`. Neobsahuje credentials a publikuje pouze web a `/api/`; interní
API `/health` a `/ready` blokuje na veřejném virtual hostu.

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

1. ověří DNS, dostupnost obou upstreamů a u produkce přesnou očekávanou revizi;
2. zazálohuje případnou předchozí konfiguraci;
3. nainstaluje HTTP virtual host a provede `nginx -t`;
4. získá nebo znovu použije Let's Encrypt certifikát;
5. vytvoří HTTPS konfiguraci, reloaduje Nginx a ověří načtení virtual hostu;
6. při chybě obnoví předchozí Nginx konfiguraci.

Volba `--http-only` je určena pouze pro diagnostiku challenge/routingu. Běžná
publikace musí používat HTTPS. Preview volba používá izolovanou databázi;
produkční volba smí být použita až po samostatném ověření kandidáta na portech
3281/4281.

Aktivace 2026-08-04 ověřila redirect HTTP → HTTPS, webovou odpověď 200,
Let's Encrypt certifikát a veřejné blokování `/health` a `/ready`.
