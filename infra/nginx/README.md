# Nginx publikace Studio Balance

Aktuální interní preview na `docker.home.cz` používá web port 3280 a API port
4280. Instalační skript je určený pro Debian/Ubuntu Nginx host
`dmz.home.cz`. Neobsahuje credentials a publikuje pouze web a `/api/`; interní
API `/health` a `/ready` blokuje na veřejném virtual hostu.

## Jednorázové udělení správcovského přístupu

Na `dmz.home.cz` přeneste celý obsah této složky a v existující administrátorské
relaci spusťte:

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

`ADMIN_EMAIL` nahraďte skutečným provozním kontaktem pro Let's Encrypt. Skript:

1. ověří DNS a dostupnost obou upstreamů;
2. zazálohuje případnou předchozí konfiguraci;
3. nainstaluje HTTP virtual host a provede `nginx -t`;
4. získá nebo znovu použije Let's Encrypt certifikát;
5. vytvoří HTTPS konfiguraci, reloaduje Nginx a provede lokální TLS smoke test;
6. při chybě obnoví předchozí Nginx konfiguraci.

Volba `--http-only` je určena pouze pro diagnostiku challenge/routingu. Běžná
publikace musí používat HTTPS. Skript zveřejňuje současný preview základ s
izolovanou databází; produkční PostgreSQL, Keycloak a S3 tím nejsou zapojené.
