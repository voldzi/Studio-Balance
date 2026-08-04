# OpenAPI

Kanonickým strojovým kontraktem REST API je `openapi.json` ve formátu JSON.
Lidský popis je v `docs/api.md`.

Počáteční specifikace obsahuje pouze systémové endpointy. Funkční endpoint z
návrhu v `docs/api.md` se smí implementovat až po doplnění cesty, requestu,
responses, schémat, security a error cases do `openapi.json`.

`openapi.yaml`, pokud někdy vznikne, je pouze generovaný export z JSON a musí
začínat:

```yaml
# This file is generated from openapi/openapi.json.
# Do not edit manually.
```

Minimální lokální kontrola:

```bash
python3 -m json.tool openapi/openapi.json >/dev/null
```

Po vytvoření stacku se doplní schema lint, breaking-change diff, publikace
dokumentace a kontraktní test implementace.
