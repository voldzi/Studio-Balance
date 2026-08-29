# ADR 0009: Dočasná výjimka TLS pro produkční PostgreSQL

- Status: Accepted, time-limited
- Datum: 2026-08-04

## Kontext

Produkční přístup k PostgreSQL vede výhradně přes
`haproxy.home.cz:5000`. Kontrola tohoto endpointu nezískala ověřitelný TLS
certifikát a server nepřijímá PostgreSQL SSL handshake. Node PostgreSQL ovladač
proto nemůže použít `sslmode=prefer`: aktuální implementace se po odmítnutí TLS
nepřepne na prosté spojení.

## Rozhodnutí

Do zprovoznění vlastního CA a `sslmode=verify-full` používá Studio Balance na
této interní trase explicitní `sslmode=disable`. Připojení nikdy nesmí mířit
přímo na PostgreSQL node ani být vystavené do internetu. Credentials zůstávají
v souboru přístupném pouze vlastníkovi na Docker hostu.

## Důsledky

Přenos mezi Docker hostem a HAProxy není touto aplikací šifrován; tato výjimka
proto blokuje označení veřejného produkčního release za dokončený. Před
veřejným go-live musí provoz dodat CA, potvrdit řetězec důvěry a změnit runtime
URL na `sslmode=verify-full` včetně ověřovacího testu.
